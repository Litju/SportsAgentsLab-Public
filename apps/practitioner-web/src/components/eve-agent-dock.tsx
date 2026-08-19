"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { MessageCircle, Send, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useEveAgent } from "eve/react";
import { MefIcon } from "./mef-icons";
import { MefActivityTrace, MefAgentMessage, MefContextCard, MefTaskRow, type MefAgentLifecycle } from "./mef/agent/mef-beautiful-ui";
import { MefBadge, MefStatusChip } from "./mef-primitives";

type EveDockContentProps = Readonly<{
  mobile: boolean;
  visibleMessages: readonly { id: string; role: string; parts: readonly { type: string; text?: string }[] }[];
  sessionId: string;
  status: string;
  error: unknown;
  agentConfigured: boolean | null;
  isBusy: boolean;
  draft: string;
  setDraft: (value: string) => void;
  canSend: boolean;
  onSend: () => void;
  lifecycle: MefAgentLifecycle;
}>;

function EveDockContent({ mobile, visibleMessages, sessionId, status, error, agentConfigured, isBusy, draft, setDraft, canSend, onSend, lifecycle }: EveDockContentProps) {
  return (
    <>
      <div className="eve-dock-header">
        <div className="eve-agent-identity"><span className="eve-orb" aria-hidden="true"><MefIcon name="spark" size={18} /></span><div><p className="mef-kicker">Persistent assistant</p><h2>Eve</h2></div></div>
        {mobile ? <Dialog.Close asChild><button aria-label="Close Eve agent dock" className="eve-dock-close" type="button"><X aria-hidden="true" size={17} /></button></Dialog.Close> : null}
        <MefStatusChip compact status={status === "ready" ? "info" : error ? "degraded" : "planned"} label={status === "ready" ? "Ready" : status} />
      </div>
      <div className="eve-dock-context"><span>Session</span><code>{sessionId}</code><MefBadge tone="violet">Explanatory</MefBadge></div>
      <MefContextCard title="Bounded by evidence">Eve can navigate and explain visible records. It cannot calculate, qualify, diagnose, or silently mutate.</MefContextCard>
      <MefActivityTrace status={lifecycle} />
      <MefTaskRow detail="Observable activity only; hidden reasoning is never shown." label="Current Eve turn" state={lifecycle === "running" || lifecycle === "streaming" ? "running" : lifecycle === "failed" || lifecycle === "degraded" ? "failed" : "idle"} />
      <div className="eve-dock-messages" aria-live="polite">
        {visibleMessages.length === 0 ? <div className="eve-empty-message"><span className="eve-empty-glyph"><MefIcon name="spark" size={18} /></span><p>Ask about this workspace. Explanations will stay bounded by verified evidence and execution state.</p></div> : visibleMessages.map((message) => {
          return <MefAgentMessage key={message.id} parts={message.parts} role={message.role} streaming={lifecycle === "streaming" && message.role === "assistant"} />;
        })}
      </div>
      {error ? <div className="eve-dock-alert" role="alert"><MefIcon name="alert" size={15} />The agent could not complete that turn. Check runtime status.</div> : null}
      {agentConfigured !== true ? <div className="eve-dock-alert eve-dock-alert-info"><MefIcon name="clock" size={15} />The assistant provider is not configured. Sending is disabled.</div> : null}
      <form className="eve-composer" onSubmit={(event) => { event.preventDefault(); onSend(); }}>
        <input aria-label="Message Eve" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Ask Eve about this workspace" disabled={agentConfigured !== true || isBusy} maxLength={1000} />
        <button aria-label="Send message to Eve" type="submit" disabled={!canSend}><Send aria-hidden="true" size={16} /></button>
      </form>
      <p className="eve-disclaimer"><MefIcon name="lock" size={13} />Practitioner retains final authority.</p>
    </>
  );
}

export function EveAgentDock() {
  const pathname = usePathname();
  const [draft, setDraft] = useState("");
  const [agentConfigured, setAgentConfigured] = useState<boolean | null>(null);
  const agent = useEveAgent();
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/status")
      .then((response) => response.json() as Promise<{ openCode?: { configured?: boolean } }>)
      .then((body) => {
        if (!cancelled) setAgentConfigured(body.openCode?.configured === true);
      })
      .catch(() => {
        if (!cancelled) setAgentConfigured(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleMessages = useMemo(() => agent.data.messages.slice(-4), [agent.data.messages]);
  const sessionId = agent.session?.sessionId ?? "not started";
  const isBusy = agent.status === "submitted" || agent.status === "streaming";
  const canSend = agentConfigured === true && !isBusy && draft.trim().length > 0;
  const lifecycle: MefAgentLifecycle = agent.error ? "failed" : agent.status === "submitted" ? "running" : agent.status === "streaming" ? "streaming" : agentConfigured === false ? "degraded" : "idle";

  if (pathname === "/login" || pathname === "/workspaces") return null;

  async function sendMessage() {
    const message = draft.trim();
    if (!message || !canSend) return;
    setDraft("");
    try {
      await agent.send(message);
    } catch {
      // The hook exposes the safe failure state in agent.error.
    }
  }

  const contentProps = { agentConfigured, canSend, draft, error: agent.error, isBusy, lifecycle, onSend: () => void sendMessage(), sessionId, setDraft, status: agent.status, visibleMessages };
  return (
    <>
      <motion.aside animate={{ opacity: 1, x: 0 }} className="eve-dock eve-dock-desktop" initial={{ opacity: 0, x: 18 }} transition={{ duration: reducedMotion ? 0 : 0.18 }} aria-label="Eve agent dock"><EveDockContent mobile={false} {...contentProps} /></motion.aside>
      <Dialog.Root>
        <Dialog.Trigger asChild><button aria-label="Open Eve agent dock" className="eve-mobile-trigger" type="button"><MessageCircle aria-hidden="true" size={18} /><span>Eve</span></button></Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="eve-dialog-overlay" />
          <Dialog.Content className="eve-mobile-dialog">
            <Dialog.Title className="mef-visually-hidden">Eve agent dock</Dialog.Title>
            <EveDockContent mobile {...contentProps} />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
