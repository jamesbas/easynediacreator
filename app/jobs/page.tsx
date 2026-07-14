import { PageHeader } from "@/components/ui/page-header";
import { JobsList } from "@/components/jobs/jobs-list";

export default function JobsPage() {
  return <><PageHeader eyebrow="GPU Queue" title="Jobs" description="Follow queued and active work, inspect failures, or cancel a generation." /><JobsList /></>;
}