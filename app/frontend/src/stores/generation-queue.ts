import { create } from "zustand";

export type GenerationStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";

export interface GenerationJob {
  id: string;
  workspace: string;
  label: string;
  startedAt: number;
  finishedAt?: number;
  status: GenerationStatus;
  progress?: number;
  message?: string;
  resultId?: string;
  error?: string;
}

interface GenerationQueueState {
  jobs: GenerationJob[];
  enqueue: (job: Omit<GenerationJob, "startedAt" | "status"> & { status?: GenerationStatus }) => void;
  update: (id: string, patch: Partial<GenerationJob>) => void;
  remove: (id: string) => void;
  clearFinished: () => void;
}

export const useGenerationQueue = create<GenerationQueueState>((set) => ({
  jobs: [],
  enqueue: (job) =>
    set((state) => ({
      jobs: [
        { startedAt: Date.now(), status: "queued", ...job },
        ...state.jobs,
      ],
    })),
  update: (id, patch) =>
    set((state) => ({
      jobs: state.jobs.map((job) =>
        job.id === id
          ? {
              ...job,
              ...patch,
              finishedAt:
                patch.status && patch.status !== "queued" && patch.status !== "running"
                  ? patch.finishedAt ?? Date.now()
                  : job.finishedAt,
            }
          : job,
      ),
    })),
  remove: (id) => set((state) => ({ jobs: state.jobs.filter((job) => job.id !== id) })),
  clearFinished: () =>
    set((state) => ({
      jobs: state.jobs.filter((job) => job.status === "queued" || job.status === "running"),
    })),
}));
