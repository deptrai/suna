import { EpsilonLoader } from '@/components/ui/epsilon-loader';

export default function ChartLoading() {
  return (
    <div className="flex flex-1 items-center justify-center h-full min-h-[60vh]">
      <EpsilonLoader size="medium" />
    </div>
  );
}
