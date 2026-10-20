import * as React from "react"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

function ItemGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div role="list" data-slot="item-group" className={cn("group/item-group flex flex-col", className)} {...props} />
  )
}

function Item({ className, asChild = false, ...props }: React.ComponentProps<"div"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "div"
  return (
    <Comp
      data-slot="item"
      className={cn(
        "group/item flex w-full flex-wrap items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 [a]:hover:bg-accent/50 [button]:hover:bg-accent/50",
        className,
      )}
      {...props}
    />
  )
}

function ItemMedia({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="item-media" className={cn("flex shrink-0 items-center justify-center", className)} {...props} />
  )
}

function ItemContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="item-content" className={cn("flex min-w-0 flex-1 flex-col gap-0.5", className)} {...props} />
}

function ItemTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="item-title"
      className={cn("flex w-fit min-w-0 items-center gap-2 text-sm leading-snug font-medium", className)}
      {...props}
    />
  )
}

function ItemDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="item-description"
      className={cn("text-muted-foreground line-clamp-2 text-sm leading-normal", className)}
      {...props}
    />
  )
}

function ItemActions({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="item-actions" className={cn("flex items-center gap-2", className)} {...props} />
}

export { Item, ItemMedia, ItemContent, ItemActions, ItemGroup, ItemTitle, ItemDescription }
