import MarkingQueuePanel from "@/components/MarkingQueuePanel";

export const dynamic = "force-dynamic";

export default function MarkingPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Marking queue</h1>
        <p className="mt-0.5 text-sm text-ink-soft">
          Everything across your students that is waiting to be marked or reviewed.
        </p>
      </div>
      {/* Server component fetches the full queue */}
      <MarkingQueuePanel />
    </div>
  );
}
