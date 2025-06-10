"use client";

import { useParams } from "next/navigation";
import MainCard from "~/components/main-card";
import Loading from "~/components/loading";
import MermaidChart from "~/components/mermaid-diagram";
import { useDiagram } from "~/hooks/useDiagram";
import { ApiKeyDialog } from "~/components/api-key-dialog";
import { ApiKeyButton } from "~/components/api-key-button";
import { useState, useEffect } from "react";
import { useStarReminder } from "~/hooks/useStarReminder";
import * as Accordion from '@radix-ui/react-accordion';

export default function Repo() {
  const [zoomingEnabled, setZoomingEnabled] = useState(false);
  const params = useParams<{ username: string; repo: string }>();

  // Use the star reminder hook
  useStarReminder();

  const {
    diagram,
    error,
    loading,
    lastGenerated,
    cost,
    showApiKeyDialog,
    handleModify,
    handleRegenerate,
    handleCopy,
    handleApiKeySubmit,
    handleCloseApiKeyDialog,
    handleOpenApiKeyDialog,
    handleExportImage,
    state,
  } = useDiagram(params.username.toLowerCase(), params.repo.toLowerCase());

  const [storedExplanation, setStoredExplanation] = useState<string | null>(null);
  const [storedMapping, setStoredMapping] = useState<string | null>(null);
  const [storedLoadingDiagram, setStoredLoadingDiagram] = useState<string | null>(null);

  useEffect(() => {
    if (loading) { // Only when actively loading
      if (state.loadingExplanation) setStoredExplanation(state.loadingExplanation);
      if (state.loadingMapping) setStoredMapping(state.loadingMapping);
      if (state.loadingDiagramText) setStoredLoadingDiagram(state.loadingDiagramText);
    }
  }, [loading, state.loadingExplanation, state.loadingMapping, state.loadingDiagramText]);

  useEffect(() => {
    if (state.status === 'complete') {
      setStoredExplanation(state.loadingExplanation ?? null);
      setStoredMapping(state.loadingMapping ?? null);
      setStoredLoadingDiagram(state.loadingDiagramText ?? null);
    }
  }, [state.status, state.loadingExplanation, state.loadingMapping, state.loadingDiagramText]);

  return (
    <div className="flex flex-col items-center p-4">
      <div className="flex w-full justify-center pt-8">
        <MainCard
          isHome={false}
          username={params.username.toLowerCase()}
          repo={params.repo.toLowerCase()}
          showCustomization={!loading && !error}
          onModify={handleModify}
          onRegenerate={handleRegenerate}
          onCopy={handleCopy}
          lastGenerated={lastGenerated}
          onExportImage={handleExportImage}
          zoomingEnabled={zoomingEnabled}
          onZoomToggle={() => setZoomingEnabled(!zoomingEnabled)}
          loading={loading}
        />
      </div>
      <div className="mt-8 flex w-full flex-col items-center gap-8">
        <Accordion.Root type="multiple" defaultValue={['item-2']} className="w-full max-w-4xl">
          <Accordion.Item value="item-1">
            <Accordion.Header>
              <Accordion.Trigger>Generation Progress</Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Content>
              <Loading
                cost={cost}
                status={state.status}
                explanation={storedExplanation}
                mapping={storedMapping}
                diagram={storedLoadingDiagram}
              />
            </Accordion.Content>
          </Accordion.Item>
          <Accordion.Item value="item-2">
            <Accordion.Header>
              <Accordion.Trigger>Mermaid Diagram</Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Content>
              {error || state.error ? (
                <div className="mt-12 text-center">
                  <p className="max-w-4xl text-lg font-medium text-purple-600">
                    {error || state.error}
                  </p>
                  {(error?.includes("API key") ||
                    state.error?.includes("API key")) && (
                    <div className="mt-8 flex flex-col items-center gap-2">
                      <ApiKeyButton onClick={handleOpenApiKeyDialog} />
                    </div>
                  )}
                </div>
              ) : loading ? (
                <p className="text-center">Diagram will be available here once generation is complete.</p>
              ) : (
                <div className="flex w-full justify-center px-4">
                  <MermaidChart chart={diagram} zoomingEnabled={zoomingEnabled} />
                </div>
              )}
            </Accordion.Content>
          </Accordion.Item>
        </Accordion.Root>
      </div>

      <ApiKeyDialog
        isOpen={showApiKeyDialog}
        onClose={handleCloseApiKeyDialog}
        onSubmit={handleApiKeySubmit}
      />
    </div>
  );
}
