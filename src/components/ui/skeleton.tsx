import { cn } from "./utils";
import { useTheme } from "../../contexts/ThemeContext";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  const { darkMode } = useTheme();
  return (
    <div
      data-slot="skeleton"
      className={cn("rounded-md", darkMode ? "bg-white/5 animate-shimmer-dark" : "bg-slate-100 animate-shimmer", className)}
      {...props}
    />
  );
}

export { Skeleton };
