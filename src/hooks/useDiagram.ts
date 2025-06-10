import { useState, useEffect, useCallback } from "react";
import {
  cacheDiagramAndExplanation,
  getCachedDiagram,
} from "~/app/_actions/cache";
import { getLastGeneratedDate } from "~/app/_actions/repo";
import { getCostOfGeneration } from "~/lib/fetch-backend";
import { exampleRepos } from "~/lib/exampleRepos";

interface StreamState {
  status:
    | "idle"
    | "started"
    | "explanation_sent"
    | "explanation"
    | "explanation_chunk"
    | "mapping_sent"
    | "mapping"
    | "mapping_chunk"
    | "diagram_sent"
    | "diagram"
    | "diagram_chunk"
    | "complete"
    | "error";
  message?: string;
  loadingExplanation?: string;
  loadingMapping?: string;
  loadingDiagramText?: string;
  finalDiagram?: string;
  error?: string;
}

interface StreamResponse {
  status: StreamState["status"];
  message?: string;
  chunk?: string;
  explanation?: string;
  mapping?: string;
  diagram?: string;
  error?: string;
}

export function useDiagram(username: string, repo: string) {
  const [diagram, setDiagram] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [lastGenerated, setLastGenerated] = useState<Date | undefined>();
  const [cost, setCost] = useState<string>("");
  const [showApiKeyDialog, setShowApiKeyDialog] = useState(false);
  // const [tokenCount, setTokenCount] = useState<number>(0);
  const [state, setState] = useState<StreamState>({
    status: "idle",
    loadingExplanation: undefined,
    loadingMapping: undefined,
    loadingDiagramText: undefined,
    finalDiagram: undefined,
    message: undefined,
    error: undefined,
  });
  const [hasUsedFreeGeneration, setHasUsedFreeGeneration] = useState<boolean>(
    () => {
      if (typeof window === "undefined") return false;
      return localStorage.getItem("has_used_free_generation") === "true";
    },
  );

  const generateDiagram = useCallback(
    async (instructions = "", githubPat?: string) => {
      setState({
        status: "started",
        message: "Starting generation process...",
      });

      try {
        const baseUrl =
          process.env.NEXT_PUBLIC_API_DEV_URL ?? "https://api.gitdiagram.com";
        const response = await fetch(`${baseUrl}/generate/stream`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            username,
            repo,
            instructions,
            api_key: localStorage.getItem("openrouter_key") ?? undefined,
            github_pat: githubPat,
          }),
        });
        if (!response.ok) {
          throw new Error("Failed to start streaming");
        }
        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("No reader available");
        }

        let accExplanation = "";
        let accMapping = "";
        let accDiagramText = "";

        // Process the stream
        const processStream = async () => {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              // Convert the chunk to text
              const chunk = new TextDecoder().decode(value);
              const lines = chunk.split("\n");

              // Process each SSE message
              for (const line of lines) {
                if (line.startsWith("data: ")) {
                  try {
                    const data = JSON.parse(line.slice(6)) as StreamResponse;

                    // If we receive an error, set loading to false immediately
                    if (data.error) {
                      setState({ status: "error", error: data.error });
                      setLoading(false);
                      return; // Add this to stop processing
                    }

                    // Update state based on the message type
                    switch (data.status) {
                      case "started":
                        setState((prev) => ({
                          ...prev,
                          status: "started",
                          message: data.message,
                        }));
                        break;
                      case "explanation_sent":
                        setState((prev) => ({
                          ...prev,
                          status: "explanation_sent",
                          message: data.message,
                        }));
                        break;
                      case "explanation":
                        setState((prev) => ({
                          ...prev,
                          status: "explanation",
                          message: data.message,
                        }));
                        break;
                      case "explanation_chunk":
                        if (data.chunk) {
                          accExplanation += data.chunk;
                          setState((prev) => ({ ...prev, loadingExplanation: accExplanation }));
                        }
                        break;
                      case "mapping_sent":
                        setState((prev) => ({
                          ...prev,
                          status: "mapping_sent",
                          message: data.message,
                        }));
                        break;
                      case "mapping":
                        setState((prev) => ({
                          ...prev,
                          status: "mapping",
                          message: data.message,
                        }));
                        break;
                      case "mapping_chunk":
                        if (data.chunk) {
                          accMapping += data.chunk;
                          setState((prev) => ({ ...prev, loadingMapping: accMapping }));
                        }
                        break;
                      case "diagram_sent":
                        setState((prev) => ({
                          ...prev,
                          status: "diagram_sent",
                          message: data.message,
                        }));
                        break;
                      case "diagram":
                        setState((prev) => ({
                          ...prev,
                          status: "diagram",
                          message: data.message,
                        }));
                        break;
                      case "diagram_chunk":
                        if (data.chunk) {
                          accDiagramText += data.chunk;
                          setState((prev) => ({ ...prev, loadingDiagramText: accDiagramText }));
                        }
                        break;
                      case "complete":
                        setState(prev => ({
                          ...prev, // Preserves accumulated loadingMapping, loadingDiagramText
                          status: "complete",
                          // Use server's final explanation if sent; otherwise, keep the accumulated one from prev state.
                          loadingExplanation: data.explanation ?? prev.loadingExplanation,
                          finalDiagram: data.diagram // Store the final diagram code from server payload
                        }));
                        const date = await getLastGeneratedDate(username, repo);
                        setLastGenerated(date ?? undefined);
                        if (!hasUsedFreeGeneration) {
                          localStorage.setItem(
                            "has_used_free_generation",
                            "true",
                          );
                          setHasUsedFreeGeneration(true);
                        }
                        break;
                      case "error":
                        setState({ status: "error", error: data.error });
                        break;
                    }
                  } catch (e) {
                    console.error("Error parsing SSE message:", e);
                  }
                }
              }
            }
          } finally {
            reader.releaseLock();
          }
        };

        await processStream();
      } catch (error) {
        setState({
          status: "error",
          error:
            error instanceof Error
              ? error.message
              : "An unknown error occurred",
        });
        setLoading(false);
      }
    },
    [username, repo, hasUsedFreeGeneration],
  );

  useEffect(() => {
    if (state.status === "complete" && state.finalDiagram) {
      // Cache the completed diagram with the usedOwnKey flag
      const hasApiKey = !!localStorage.getItem("openrouter_key");
      void cacheDiagramAndExplanation(
        username,
        repo,
        state.finalDiagram,
        state.loadingExplanation ?? "No explanation provided",
        state.loadingMapping ?? "No mapping provided",
        hasApiKey,
      );
      setDiagram(state.finalDiagram);
      void getLastGeneratedDate(username, repo).then((date) =>
        setLastGenerated(date ?? undefined),
      );
    } else if (state.status === "error") {
      setLoading(false);
    }
  }, [state.status, state.finalDiagram, username, repo, state.loadingExplanation]);

  const getDiagram = useCallback(async () => {
    setLoading(true);
    setError("");
    setCost("");

    try {
      // Check cache first - always allow access to cached diagrams
      const cached = await getCachedDiagram(username, repo);
      const github_pat = localStorage.getItem("github_pat");

      if (cached?.diagram) { // Check for cached object and diagram property
        setDiagram(cached.diagram);
        setState(prev => ({
          ...prev,
          status: "complete",
          loadingExplanation: cached.explanation || "Cached explanation not found.",
          loadingMapping: cached.mapping ?? "Cached mapping not found.",
          loadingDiagramText: cached.diagram ?? "Diagram loaded from cache. Textual representation of diagram is not stored with cache.",
          finalDiagram: cached.diagram
        }));
        const date = await getLastGeneratedDate(username, repo);
        setLastGenerated(date ?? undefined);
        return;
      }

      // TEMP: LET USERS HAVE INFINITE GENERATIONS
      // Only check for API key if we need to generate a new diagram
      // const storedApiKey = localStorage.getItem("openai_key");
      // if (hasUsedFreeGeneration && !storedApiKey) {
      //   setError(
      //     "You've used your one free diagram. Please enter your API key to continue. As a student, I can't afford to keep it totally free and I hope you understand :)",
      //   );
      //   setState({ status: "error", error: "API key required" });
      //   return;
      // }

      // Get cost estimate
      const costEstimate = await getCostOfGeneration(
        username,
        repo,
        "",
        github_pat ?? undefined,
      );

      if (costEstimate.error) {
        console.error("Cost estimation failed:", costEstimate.error);
        // if (costEstimate.requires_api_key) {
        //   setTokenCount(costEstimate.token_count ?? 0);
        // }
        // TODO: come to think of it, why is requires api key based on tokens? this unimplemented option is smarter. Add API key dialog
        setError(costEstimate.error);
        return;
      }

      setCost(costEstimate.cost ?? "");

      // Start streaming generation
      await generateDiagram("", github_pat ?? undefined);

      // Note: The diagram and lastGenerated will be set by the generateDiagram function
      // through the state updates
    } catch (error) {
      console.error("Error in getDiagram:", error);
      setError("Something went wrong. Please try again later.");
    } finally {
      setLoading(false);
    }
  }, [username, repo, generateDiagram]);

  useEffect(() => {
    void getDiagram();
  }, [getDiagram]);

  const isExampleRepo = (repoName: string): boolean => {
    return Object.values(exampleRepos).some((value) =>
      value.includes(repoName),
    );
  };

  const handleModify = async (instructions: string) => {
    if (isExampleRepo(repo)) {
      setError("Example repositories cannot be modified.");
      return;
    }

    setLoading(true);
    setError("");
    setCost("");
    try {
      // Start streaming generation with instructions
      await generateDiagram(instructions);
    } catch (error) {
      console.error("Error modifying diagram:", error);
      setError("Failed to modify diagram. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerate = async (instructions: string) => {
    if (isExampleRepo(repo)) {
      setError("Example repositories cannot be regenerated.");
      return;
    }

    setLoading(true);
    setError("");
    setCost("");
    try {
      const github_pat = localStorage.getItem("github_pat");

      // TEMP: LET USERS HAVE INFINITE GENERATIONS
      // const storedApiKey = localStorage.getItem("openai_key");

      // Check if user has used their free generation and doesn't have an API key
      // if (hasUsedFreeGeneration && !storedApiKey) {
      //   setError(
      //     "You've used your one free diagram. Please enter your API key to continue. As a student, I can't afford to keep it totally free and I hope you understand :)",
      //   );
      //   setLoading(false);
      //   return;
      // }

      const costEstimate = await getCostOfGeneration(username, repo, "");

      if (costEstimate.error) {
        console.error("Cost estimation failed:", costEstimate.error);
        setError(costEstimate.error);
        return;
      }

      setCost(costEstimate.cost ?? "");

      // Start streaming generation with instructions
      await generateDiagram(instructions, github_pat ?? undefined);
    } catch (error) {
      console.error("Error regenerating diagram:", error);
      setError("Failed to regenerate diagram. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(diagram);
    } catch (error) {
      console.error("Error copying to clipboard:", error);
    }
  };

  const handleExportImage = () => {
    const svgElement = document.querySelector(".mermaid svg");
    if (!(svgElement instanceof SVGSVGElement)) return;

    try {
      const canvas = document.createElement("canvas");
      const scale = 4;

      const bbox = svgElement.getBBox();
      const transform = svgElement.getScreenCTM();
      if (!transform) return;

      const width = Math.ceil(bbox.width * transform.a);
      const height = Math.ceil(bbox.height * transform.d);
      canvas.width = width * scale;
      canvas.height = height * scale;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const svgData = new XMLSerializer().serializeToString(svgElement);
      const img = new Image();

      img.onload = () => {
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0, width, height);

        const a = document.createElement("a");
        a.download = "diagram.png";
        a.href = canvas.toDataURL("image/png", 1.0);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      };

      img.src =
        "data:image/svg+xml;base64," +
        btoa(unescape(encodeURIComponent(svgData)));
    } catch (error) {
      console.error("Error generating PNG:", error);
    }
  };

  const handleApiKeySubmit = async (apiKey: string) => {
    setShowApiKeyDialog(false);
    setLoading(true);
    setError("");

    // Store the key first
    localStorage.setItem("openrouter_key", apiKey);

    // Then generate diagram using stored key
    const github_pat = localStorage.getItem("github_pat");
    try {
      await generateDiagram("", github_pat ?? undefined);
    } catch (error) {
      console.error("Error generating with API key:", error);
      setError("Failed to generate diagram with provided API key.");
    } finally {
      setLoading(false);
    }
  };

  const handleCloseApiKeyDialog = () => {
    setShowApiKeyDialog(false);
  };

  const handleOpenApiKeyDialog = () => {
    setShowApiKeyDialog(true);
  };

  return {
    diagram,
    error,
    loading,
    lastGenerated,
    cost,
    handleModify,
    handleRegenerate,
    handleCopy,
    showApiKeyDialog,
    // tokenCount,
    handleApiKeySubmit,
    handleCloseApiKeyDialog,
    handleOpenApiKeyDialog,
    handleExportImage,
    state,
  };
}
