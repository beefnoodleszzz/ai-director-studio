import { initializeTaskRecovery } from "@/lib/task-recovery";

let registered = false;

export function registerNodeInstrumentation() {
  if (registered) return;
  registered = true;
  initializeTaskRecovery();
}
