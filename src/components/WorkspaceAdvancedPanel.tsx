import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Map,
  ShieldCheck,
  Wand2,
  Wrench,
  GitBranch,
  ScanSearch,
  TerminalSquare,
} from "lucide-react";
import { ProjectMapView } from "@/components/ProjectMapView";
import { HealthScoreView } from "@/components/HealthScoreView";
import { ProjectModificationPanel } from "@/components/ProjectModificationPanel";
import { WorkspaceToolsPanel } from "@/components/WorkspaceToolsPanel";
import { GitToolsPanel } from "@/components/GitToolsPanel";
import { CodeReviewPanel } from "@/components/CodeReviewPanel";
import { AiTerminalPanel } from "@/components/AiTerminalPanel";

export function WorkspaceAdvancedPanel({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  return (
    <div className="mt-6 border-t border-border pt-5">
      <Tabs defaultValue="modify">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="modify">
            <Wand2 className="size-3.5 mr-1.5" /> Modify
          </TabsTrigger>
          <TabsTrigger value="map">
            <Map className="size-3.5 mr-1.5" /> Map
          </TabsTrigger>
          <TabsTrigger value="health">
            <ShieldCheck className="size-3.5 mr-1.5" /> Health
          </TabsTrigger>
          <TabsTrigger value="tools">
            <Wrench className="size-3.5 mr-1.5" /> Tools
          </TabsTrigger>
          <TabsTrigger value="git">
            <GitBranch className="size-3.5 mr-1.5" /> Git
          </TabsTrigger>
          <TabsTrigger value="review">
            <ScanSearch className="size-3.5 mr-1.5" /> Review
          </TabsTrigger>
          <TabsTrigger value="terminal">
            <TerminalSquare className="size-3.5 mr-1.5" /> Terminal
          </TabsTrigger>
        </TabsList>

        <TabsContent value="modify" className="pt-4">
          <ProjectModificationPanel projectId={projectId} projectName={projectName} />
        </TabsContent>
        <TabsContent value="map" className="pt-4">
          <ProjectMapView projectId={projectId} />
        </TabsContent>
        <TabsContent value="health" className="pt-4">
          <HealthScoreView projectId={projectId} />
        </TabsContent>
        <TabsContent value="tools" className="pt-4">
          <WorkspaceToolsPanel projectId={projectId} projectName={projectName} />
        </TabsContent>
        <TabsContent value="git" className="pt-4">
          <GitToolsPanel projectId={projectId} />
        </TabsContent>
        <TabsContent value="review" className="pt-4">
          <CodeReviewPanel projectId={projectId} />
        </TabsContent>
        <TabsContent value="terminal" className="pt-4">
          <AiTerminalPanel projectId={projectId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
