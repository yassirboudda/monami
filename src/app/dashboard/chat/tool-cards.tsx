"use client"

import DesktopPage from "@/app/dashboard/desktop/page"
import ExtensionPage from "@/app/dashboard/extension/page"
import ShopsPage from "@/app/dashboard/shops/page"
import StockPage from "@/app/dashboard/stock/page"
import TeamPage from "@/app/dashboard/team/page"
import WorkflowsPage from "@/app/dashboard/workflows/page"
import { useState } from "react"
import { RunWorkflowModal } from "@/components/run-workflow"
import { useWorkspaceResource } from "@/lib/use-workspace-resource"

// Display tools: the whole dashboard page, live, inside the conversation.
export const EMBEDDED_PAGES: Record<string, { label: string; Page: () => React.ReactNode }> = {
  "tool-showWorkflows": { label: "your workflows", Page: WorkflowsPage },
  "tool-showShops": { label: "your shops", Page: ShopsPage },
  "tool-showStock": { label: "your stock", Page: StockPage },
  "tool-showDesktop": { label: "the desktop", Page: DesktopPage },
  "tool-showTeam": { label: "your team", Page: TeamPage },
  "tool-showExtensionSetup": { label: "the extension", Page: ExtensionPage },
}

type Flow = { id: string; title: string; marketplace: string }

/** The model only knows the workflow id; the run card needs its title and marketplace too. */
export function RunWorkflowCard({ workflowId, onClose }: { workflowId: string; onClose: () => void }) {
  const { data, error, request } = useWorkspaceResource<{ workflows: Flow[] }>("/v1/workflows")
  // RunWorkflowModal starts a run whenever `workflow` changes identity: keep the first match so a data refresh doesn't launch another run.
  const [workflow, setWorkflow] = useState<Flow | null>(null)
  const found = data?.workflows.find((w) => w.id === workflowId)
  if (found && !workflow) setWorkflow(found)
  if (error) return <p className="text-[13px] text-muted-foreground">Could not load your workflows: {error.message}</p>
  if (!data) return null
  if (!workflow) return <p className="text-[13px] text-muted-foreground">This workflow no longer exists.</p>
  return <RunWorkflowModal inline workflow={workflow} request={request} onClose={onClose} />
}
