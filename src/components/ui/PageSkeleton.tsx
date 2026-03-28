import { Skeleton } from "./skeleton";

export function PageSkeleton() {
  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar Skeleton */}
      <div className="hidden md:flex w-80 bg-white border-r border-slate-200 flex-col p-6 space-y-8">
        <div className="flex items-center gap-3 px-2">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <Skeleton className="h-6 w-32" />
        </div>
        <div className="space-y-4 pt-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-2 py-1">
              <Skeleton className="h-5 w-5 rounded-md" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
      </div>

      {/* Main Content Skeleton */}
      <div className="flex-1 p-4 md:p-8 space-y-10 overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-center bg-white/50 p-4 rounded-3xl border border-slate-100 backdrop-blur-sm">
          <div className="space-y-3">
            <Skeleton className="h-9 w-64 rounded-xl" />
            <Skeleton className="h-4 w-96 rounded-lg opacity-60" />
          </div>
          <div className="flex gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <Skeleton className="h-10 w-32 rounded-xl" />
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white p-7 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-5">
              <div className="flex justify-between items-start">
                <Skeleton className="h-12 w-12 rounded-2xl" />
                <Skeleton className="h-5 w-14 rounded-lg" />
              </div>
              <div className="space-y-3">
                <Skeleton className="h-4 w-28 rounded-lg opacity-60" />
                <Skeleton className="h-10 w-20 rounded-xl" />
              </div>
            </div>
          ))}
        </div>

        {/* Big sections */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm h-72 space-y-6">
              <div className="flex justify-between">
                <Skeleton className="h-7 w-40 rounded-lg" />
                <Skeleton className="h-7 w-24 rounded-lg opacity-60" />
              </div>
              <Skeleton className="h-full w-full rounded-2xl" />
            </div>
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-6">
              <Skeleton className="h-7 w-48 rounded-lg" />
              <div className="space-y-5">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex gap-5 items-center">
                    <Skeleton className="h-16 w-16 rounded-2xl shrink-0" />
                    <div className="flex-1 space-y-3">
                      <div className="flex justify-between">
                         <Skeleton className="h-5 w-1/3 rounded-lg" />
                         <Skeleton className="h-4 w-20 rounded-lg opacity-60" />
                      </div>
                      <Skeleton className="h-4 w-full rounded-lg opacity-60" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="space-y-8">
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm h-full min-h-[600px] space-y-8">
               <Skeleton className="h-7 w-56 rounded-lg" />
               <div className="flex justify-center">
                 <Skeleton className="h-48 w-48 rounded-full" />
               </div>
               <div className="space-y-6 pt-4">
                 {[...Array(4)].map((_, i) => (
                   <div key={i} className="space-y-3">
                     <div className="flex justify-between">
                        <Skeleton className="h-4 w-32 rounded-lg" />
                        <Skeleton className="h-4 w-12 rounded-lg" />
                     </div>
                     <Skeleton className="h-2.5 w-full rounded-full" />
                   </div>
                 ))}
               </div>
               <Skeleton className="h-12 w-full rounded-2xl mt-4" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
