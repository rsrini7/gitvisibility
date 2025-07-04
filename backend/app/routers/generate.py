from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from app.services.github_service import GitHubService
from app.services.o4_mini_openai_service import OpenAIo4Service
from app.prompts import (
    SYSTEM_FIRST_PROMPT,
    SYSTEM_SECOND_PROMPT,
    SYSTEM_THIRD_PROMPT,
    ADDITIONAL_SYSTEM_INSTRUCTIONS_PROMPT,
)
from anthropic._exceptions import RateLimitError
from pydantic import BaseModel
from functools import lru_cache
import re
import json
import asyncio

# from app.services.claude_service import ClaudeService
# from app.core.limiter import limiter

load_dotenv()

router = APIRouter(prefix="/generate", tags=["OpenAI o4-mini"])

# Initialize services
# claude_service = ClaudeService()
o4_service = OpenAIo4Service()


# cache github data to avoid double API calls from cost and generate
@lru_cache(maxsize=100)
def get_cached_github_data(username: str, repo: str, github_pat: str | None = None):
    # Create a new service instance for each call with the appropriate PAT
    current_github_service = GitHubService(pat=github_pat)

    default_branch = current_github_service.get_default_branch(username, repo)
    if not default_branch:
        default_branch = "main"  # fallback value

    file_tree = current_github_service.get_github_file_paths_as_list(username, repo)
    readme = current_github_service.get_github_readme(username, repo)

    return {"default_branch": default_branch, "file_tree": file_tree, "readme": readme}


class ApiRequest(BaseModel):
    username: str
    repo: str
    instructions: str = ""
    api_key: str | None = None
    github_pat: str | None = None


@router.post("/cost")
# @limiter.limit("5/minute") # TEMP: disable rate limit for growth??
async def get_generation_cost(request: Request, body: ApiRequest):
    try:
        # Get file tree and README content
        github_data = get_cached_github_data(body.username, body.repo, body.github_pat)
        file_tree = github_data["file_tree"]
        readme = github_data["readme"]

        # Calculate combined token count
        # file_tree_tokens = claude_service.count_tokens(file_tree)
        # readme_tokens = claude_service.count_tokens(readme)

        file_tree_tokens = o4_service.count_tokens(file_tree)
        readme_tokens = o4_service.count_tokens(readme)

        # CLAUDE: Calculate approximate cost
        # Input cost: $3 per 1M tokens ($0.000003 per token)
        # Output cost: $15 per 1M tokens ($0.000015 per token)
        # input_cost = ((file_tree_tokens * 2 + readme_tokens) + 3000) * 0.000003
        # output_cost = 3500 * 0.000015
        # estimated_cost = input_cost + output_cost

        # Input cost: $1.1 per 1M tokens ($0.0000011 per token)
        # Output cost: $4.4 per 1M tokens ($0.0000044 per token)
        input_cost = ((file_tree_tokens * 2 + readme_tokens) + 3000) * 0.0000011
        output_cost = (
            8000 * 0.0000044
        )  # 8k just based on what I've seen (reasoning is expensive)
        estimated_cost = input_cost + output_cost

        # Format as currency string
        cost_string = f"${estimated_cost:.2f} USD"
        return {"cost": cost_string}
    except Exception as e:
        return {"error": str(e)}


def process_click_events(diagram: str, username: str, repo: str, branch: str) -> str:
    """
    Process click events in Mermaid diagram to include full GitHub URLs.
    Detects if path is file or directory and uses appropriate URL format.
    """

    def replace_path(match):
        # Extract the path from the click event
        raw_path = match.group(2).strip("\"'")
        
        # Remove fragment if present (e.g., path/to/file.py#functionName)
        path_without_fragment = raw_path.split("#")[0]

        # Determine if path is likely a file (has extension) or directory
        is_file = "." in path_without_fragment.split("/")[-1]

        # Construct GitHub URL
        base_url = f"https://github.com/{username}/{repo}"
        path_type = "blob" if is_file else "tree"
        full_url = f"{base_url}/{path_type}/{branch}/{path_without_fragment}"

        # Return the full click event with the new URL, keeping original raw_path for the click parameter if needed by Mermaid/JS
        # For now, the instruction implies the LLM generates the click unique_id and the path parameter.
        # The path parameter itself should be the one that can include #fragment if the LLM generates it that way.
        # However, the URL formed for GitHub navigation must NOT include the #fragment.
        # The prompt for SYSTEM_THIRD_PROMPT indicates click events like: `click NodeID_FunctionX "path/to/file.ext#FunctionX"`
        # So, the raw_path (which includes #fragment) should be used in the click parameter passed to Mermaid.
        # The modification here is only for the URL generation part.
        # The problem statement: "URL should always point to the file itself, not a fragment"
        # "if path is src/utils/api.ts#fetchData, the generated GitHub URL should still be for src/utils/api.ts."
        # This means the `full_url` should use `path_without_fragment`.
        # The actual click string in mermaid should still use `raw_path` if that's what the LLM is told to make.
        # The current regex `r'click ([^\s"]+)\s+"([^"]+)"'` captures the node ID and the path argument.
        # The `SYSTEM_THIRD_PROMPT` asks the LLM to generate `click NodeID "path/to/file#FuncName"`.
        # So `match.group(2)` is `path/to/file#FuncName`. This `raw_path` is used as the click parameter.
        # The `full_url` used for actual navigation is what we are fixing.
        # The line `return f'click {match.group(1)} "{full_url}"'` was in the original code.
        # This would change the click parameter in Mermaid to not have the fragment.
        # If the fragment is needed for client-side JS later, this would be wrong.
        # Re-reading: "The URL should always point to the file itself... For example, if path is src/utils/api.ts#fetchData, the generated GitHub URL should still be for src/utils/api.ts."
        # This implies that the string that `process_click_events` *outputs* should have the full_url (without fragment) as the click argument.
        # This seems correct, as the purpose of this function is to make GitHub clickable links.
        # Client-side JS that might use the fragment would have to be handled differently if it relied on this specific click parameter.
        # For now, the goal is to make the GitHub link correct.

        return f'click {match.group(1)} "{full_url}"'
        return f'click {match.group(1)} "{full_url}"'

    # Match click events: click ComponentName "path/to/something"
    click_pattern = r'click ([^\s"]+)\s+"([^"]+)"'
    return re.sub(click_pattern, replace_path, diagram)


@router.post("/stream")
async def generate_stream(request: Request, body: ApiRequest):
    try:
        # Initial validation checks
        if len(body.instructions) > 1000:
            return {"error": "Instructions exceed maximum length of 1000 characters"}

        if body.repo in [
            "fastapi",
            "streamlit",
            "flask",
            "api-analytics",
            "monkeytype",
        ]:
            return {"error": "Example repos cannot be regenerated"}

        async def event_generator():
            try:
                # Get cached github data
                github_data = get_cached_github_data(
                    body.username, body.repo, body.github_pat
                )
                default_branch = github_data["default_branch"]
                file_tree = github_data["file_tree"]
                readme = github_data["readme"]

                # Send initial status
                yield f"data: {json.dumps({'status': 'started', 'message': 'Starting generation process...'})}\n\n"
                await asyncio.sleep(0.1)

                # Token count check
                combined_content = f"{file_tree}\n{readme}"
                token_count = o4_service.count_tokens(combined_content)

                if 50000 < token_count < 195000 and not body.api_key:
                    yield f"data: {json.dumps({'error': f'File tree and README combined exceeds token limit (50,000). Current size: {token_count} tokens. This GitHub repository is too large for my wallet, but you can continue by providing your own OpenAI API key.'})}\n\n"
                    return
                elif token_count > 195000:
                    yield f"data: {json.dumps({'error': f'Repository is too large (>195k tokens) for analysis. OpenAI o4-mini\'s max context length is 200k tokens. Current size: {token_count} tokens.'})}\n\n"
                    return

                # Prepare prompts
                first_system_prompt = SYSTEM_FIRST_PROMPT
                third_system_prompt = SYSTEM_THIRD_PROMPT
                if body.instructions:
                    first_system_prompt = (
                        first_system_prompt
                        + "\n"
                        + ADDITIONAL_SYSTEM_INSTRUCTIONS_PROMPT
                    )
                    third_system_prompt = (
                        third_system_prompt
                        + "\n"
                        + ADDITIONAL_SYSTEM_INSTRUCTIONS_PROMPT
                    )

                # Phase 1: Get explanation
                yield f"data: {json.dumps({'status': 'explanation_sent', 'message': 'Sending explanation request to o4-mini...'})}\n\n"
                await asyncio.sleep(0.1)
                yield f"data: {json.dumps({'status': 'explanation', 'message': 'Analyzing repository structure...'})}\n\n"
                explanation = ""
                async for chunk in o4_service.call_o4_api_stream(
                    system_prompt=first_system_prompt,
                    data={
                        "file_tree": file_tree,
                        "readme": readme,
                        "instructions": body.instructions,
                    },
                    api_key=body.api_key,
                ):
                    explanation += chunk
                    yield f"data: {json.dumps({'status': 'explanation_chunk', 'chunk': chunk})}\n\n"

                if "BAD_INSTRUCTIONS" in explanation:
                    yield f"data: {json.dumps({'error': 'Invalid or unclear instructions provided'})}\n\n"
                    return

                # Phase 2: Get component mapping
                yield f"data: {json.dumps({'status': 'mapping_sent', 'message': 'Sending component mapping request to o4-mini...'})}\n\n"
                await asyncio.sleep(0.1)
                yield f"data: {json.dumps({'status': 'mapping', 'message': 'Creating component mapping...'})}\n\n"
                full_second_response = ""
                async for chunk in o4_service.call_o4_api_stream(
                    system_prompt=SYSTEM_SECOND_PROMPT,
                    data={"explanation": explanation, "file_tree": file_tree},
                    api_key=body.api_key,
                ):
                    full_second_response += chunk
                    yield f"data: {json.dumps({'status': 'mapping_chunk', 'chunk': chunk})}\n\n"

                # i dont think i need this anymore? but keep it here for now
                # Extract component mapping
                start_tag = "<component_mapping>"
                end_tag = "</component_mapping>"
                component_mapping_text = full_second_response[
                    full_second_response.find(start_tag) : full_second_response.find(
                        end_tag
                    )
                ]

                # Phase 3: Generate Mermaid diagram
                yield f"data: {json.dumps({'status': 'diagram_sent', 'message': 'Sending diagram generation request to o4-mini...'})}\n\n"
                await asyncio.sleep(0.1)
                yield f"data: {json.dumps({'status': 'diagram', 'message': 'Generating diagram...'})}\n\n"
                mermaid_code = ""
                async for chunk in o4_service.call_o4_api_stream(
                    system_prompt=third_system_prompt,
                    data={
                        "explanation": explanation,
                        "component_mapping": component_mapping_text,
                        "file_tree": file_tree, # Added for context
                        "readme": readme, # Added for context
                        "instructions": body.instructions,
                    },
                    api_key=body.api_key,
                ):
                    mermaid_code += chunk
                    yield f"data: {json.dumps({'status': 'diagram_chunk', 'chunk': chunk})}\n\n"

                # Process final diagram
                mermaid_code = mermaid_code.replace("```mermaid", "").replace("```", "")
                if "BAD_INSTRUCTIONS" in mermaid_code:
                    yield f"data: {json.dumps({'error': 'Invalid or unclear instructions provided'})}\n\n"
                    return

                processed_diagram = process_click_events(
                    mermaid_code, body.username, body.repo, default_branch
                )

                # Send final result
                yield f"data: {json.dumps({
                    'status': 'complete',
                    'diagram': processed_diagram,
                    'explanation': explanation,
                    'mapping': component_mapping_text
                })}\n\n"

            except Exception as e:
                yield f"data: {json.dumps({'error': str(e)})}\n\n"

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "X-Accel-Buffering": "no",  # Hint to Nginx
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
            },
        )
    except Exception as e:
        return {"error": str(e)}
