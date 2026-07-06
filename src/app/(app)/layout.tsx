import { Sidebar } from "@/app/_components/Sidebar";
import { BRANCHES, getBranch } from "@/lib/branch";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const branch = await getBranch();
  return (
    <div className="flex min-h-screen w-full bg-white text-zinc-900">
      <Sidebar branch={branch} branches={[...BRANCHES]} />
      <div className="min-w-0 flex-1 overflow-x-hidden">{children}</div>
    </div>
  );
}
