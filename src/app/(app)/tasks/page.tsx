"use client";

import { useState } from "react";
import useSWR from "swr";
import { api } from "@/lib/api";
import { PriorityBadge } from "@/components/PriorityBadge";
import { SourceBadge } from "@/components/SourceBadge";
import { cn, formatRelativeTime } from "@/lib/ui";
import type { TaskDTO } from "@/lib/types";

const FILTERS: { value: string; label: string }[] = [
  { value: "todo", label: "To do" },
  { value: "doing", label: "Doing" },
  { value: "done", label: "Done" },
  { value: "all", label: "All" },
];

export default function TasksPage() {
  const [status, setStatus] = useState("todo");
  const apiStatus = status === "all" ? undefined : status;
  const { data: tasks, isLoading } = useSWR(["tasks", status], () => api.tasks(apiStatus));

  return (
    <div className="space-y-6 pb-16">
      <div>
        <h1 className="font-serif text-3xl font-semibold text-ink">Tasks</h1>
        <p className="mt-1 text-sm text-ink-soft">The busywork, tracked so it doesn&apos;t get lost.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatus(f.value)}
            className={cn(
              "rounded-full px-3 py-1 text-sm font-medium transition",
              status === f.value ? "bg-brand-soft text-brand-ink" : "text-ink-soft hover:bg-paper-raised",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-sm text-ink-faint">Loading tasks…</p>}

      {!isLoading && (!tasks || tasks.length === 0) && <p className="text-sm text-ink-faint">Nothing here.</p>}

      {tasks && tasks.length > 0 && (
        <ul className="space-y-2">
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} />
          ))}
        </ul>
      )}
    </div>
  );
}

function TaskRow({ task }: { task: TaskDTO }) {
  return (
    <li className="flex items-center gap-3 rounded-lg border border-hairline bg-paper-raised p-3">
      <PriorityBadge priority={task.priority} className="shrink-0" />
      <p className="min-w-0 flex-1 truncate text-sm text-ink">{task.title}</p>
      <span className="shrink-0 text-xs text-ink-faint">{task.deadline ? formatRelativeTime(task.deadline) : "no deadline"}</span>
      {task.source && <SourceBadge source={task.source} className="shrink-0" />}
    </li>
  );
}
