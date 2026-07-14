import * as React from 'react';
import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const toggleVariants = cva(
  "inline-flex items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-colors outline-none hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-[image:var(--grad-primary)] data-[state=on]:text-primary-foreground data-[state=on]:shadow-sm data-[state=on]:shadow-primary/25 focus-visible:ring-ring/50 focus-visible:ring-[3px] [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 whitespace-nowrap",
  {
    variants: {
      variant: {
        default: 'bg-transparent',
        outline: 'border border-input bg-transparent shadow-sm',
      },
      size: {
        default: 'h-8 px-3 min-w-8',
        sm: 'h-7 px-2 min-w-7 text-xs',
        lg: 'h-10 px-4 min-w-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

const ToggleGroupContext = React.createContext<VariantProps<typeof toggleVariants>>({
  size: 'default',
  variant: 'default',
});

function ToggleGroup({
  className,
  variant,
  size,
  children,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root> &
  VariantProps<typeof toggleVariants>) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      data-variant={variant}
      data-size={size}
      className={cn(
        'group/toggle-group flex w-fit items-center gap-0.5 rounded-md bg-secondary/60 p-0.5',
        className,
      )}
      {...props}
    >
      <ToggleGroupContext.Provider value={{ variant, size }}>
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive.Root>
  );
}

function ToggleGroupItem({
  className,
  children,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item> &
  VariantProps<typeof toggleVariants>) {
  const context = React.useContext(ToggleGroupContext);
  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      data-variant={context.variant || variant}
      data-size={context.size || size}
      className={cn(
        toggleVariants({ variant: context.variant || variant, size: context.size || size }),
        className,
      )}
      {...props}
    >
      {children}
    </ToggleGroupPrimitive.Item>
  );
}

export { ToggleGroup, ToggleGroupItem, toggleVariants };
