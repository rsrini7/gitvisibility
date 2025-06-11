[![Image](./docs/readme_img.png "GitCodeMap Front Page")](https://gitdiagram.com/)

![License](https://img.shields.io/badge/license-MIT-blue.svg)
[![Kofi](https://img.shields.io/badge/Kofi-F16061.svg?logo=ko-fi&logoColor=white)](https://ko-fi.com/ahmedkhaleel2004)

# GitCodeMap

Turn any GitHub repository into an interactive code map for visualization in seconds.

You can also replace `hub` with `diagram` in any Github URL to access its diagram.

## 🚀 Features

- 👀 **Instant Code Mapping**: Convert any GitHub repository into a detailed code map showing files, functions, classes, and their relationships.
- 🎨 **Interactivity**: Explore code maps with features like clicking components to navigate to source files, and panning & zooming for detailed diagram inspection.
- ⚡ **Fast Generation**: Powered by OpenRouter for quick and accurate code maps.
- 🔄 **Customization**: Modify and regenerate code maps with custom instructions.
- 🌐 **API Access**: Public API available for integration (WIP)
- ✨ **Enhanced Diagram Interaction & Data Persistence**:
  - **Accordion UI**: The diagram page now features an intuitive accordion interface. The first section displays detailed generation progress and textual data (explanation, component mapping, and Mermaid.js diagram text), while the second section presents the final rendered interactive diagram. This allows users to easily access all underlying information alongside the visual representation.
  - **Comprehensive Caching**: To improve loading times and user experience for revisited repositories, the system now caches not only the diagram but also its corresponding explanation and component mapping data. This ensures all relevant information is readily available and populates both sections of the accordion upon reload. The styling of these interactive elements has also been refined for enhanced clarity and user experience.
  - *(For Developers/Contributors: This involved updating the `diagram_cache` database table to include a `mapping` column to store the new mapping data.)*

## ⚙️ Tech Stack

- **Frontend**: Next.js, TypeScript, Tailwind CSS, ShadCN, Radix UI, Lucide Icons
- **Backend**: FastAPI, Python, Server Actions
- **Database**: PostgreSQL (with Drizzle ORM)
- **AI**: OpenRouter
- **Deployment**: Vercel (Frontend), EC2 (Backend)
- **CI/CD**: GitHub Actions
- **Analytics**: PostHog, Api-Analytics

## 🤔 About

I created this because I wanted to contribute to open-source projects but quickly realized their codebases are too massive for me to dig through manually, so this helps me get started - but it's definitely got many more use cases!

Given any public (or private!) GitHub repository it generates detailed code maps in Mermaid.js with OpenRouter! (Previously Claude 3.5 Sonnet)

I extract information from the file tree and README for details and interactivity (you can click components to be taken to relevant files and directories)

Most of what you might call the "processing" of this app is done with prompt engineering - see `/backend/app/prompts.py`. This basically extracts and pipelines data and analysis for a larger action workflow, ending in the code map (Mermaid.js).

## 🔒 How to diagram private repositories

You can simply click on "Private Repos" in the header and follow the instructions by providing a GitHub personal access token with the `repo` scope.

You can also self-host this app locally (backend separated as well!) with the steps below.

## 🛠️ Self-hosting / Local Development

1. Clone the repository

```bash
git clone https://github.com/ahmedkhaleel2004/gitdiagram.git
cd gitdiagram
```

2. Install dependencies

```bash
pnpm i
```

3. Set up environment variables (create .env)

```bash
cp .env.example .env
```

Then edit the `.env` file with your OpenRouter API key and optional GitHub personal access token.

4. Run backend

```bash
docker-compose up --build -d
```

Logs available at `docker-compose logs -f`
The FastAPI server will be available at `localhost:8000`

5. Start local database

```bash
chmod +x start-database.sh
./start-database.sh
```

When prompted to generate a random password, input yes.
The Postgres database will start in a container at `localhost:5432`

6. Initialize the database schema

```bash
pnpm db:push
```

You can view and interact with the database using `pnpm db:studio`

7. Run Frontend

```bash
pnpm dev
```

You can now access the website at `localhost:3000` and edit the rate limits defined in `backend/app/routers/generate.py` in the generate function decorator.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Acknowledgements

Shoutout to [Romain Courtois](https://github.com/cyclotruc)'s [Gitingest](https://gitingest.com/) for inspiration and styling

## 📈 Rate Limits

I am currently hosting it for free with no rate limits though this is somewhat likely to change in the future.

<!-- If you would like to bypass these, self-hosting instructions are provided. I also plan on adding an input for your own Anthropic API key.

Diagram generation:

- 1 request per minute
- 5 requests per day -->

## 🤔 Future Steps

- Implement font-awesome icons in diagram
- Implement an embedded feature like star-history.com but for diagrams. The diagram could also be updated progressively as commits are made.
