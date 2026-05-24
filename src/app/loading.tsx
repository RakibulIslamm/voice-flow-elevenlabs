import { LoadingState } from '@/components/states/loading-state';

export default function RootLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <LoadingState />
    </div>
  );
}
