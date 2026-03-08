import { cn } from "@/lib/utils"
import { Card, CardContent, CardFooter, CardHeader } from "./card"

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  )
}

function SkeletonCard() {
  return (
    <Card className="border">
      <CardHeader className="p-4 pb-2">
        <Skeleton className="h-6 w-3/4 mb-2" />
        <Skeleton className="h-4 w-full" />
      </CardHeader>
      <CardContent className="p-4 pt-2">
        <Skeleton className="h-4 w-full mb-2" />
        <Skeleton className="h-4 w-5/6 mb-2" />
        <Skeleton className="h-4 w-4/6" />
      </CardContent>
      <CardFooter className="p-4 pt-2 flex justify-between">
        <Skeleton className="h-3 w-[80px]" />
        <Skeleton className="h-3 w-[100px]" />
      </CardFooter>
    </Card>
  )
}

export { Skeleton, SkeletonCard }
