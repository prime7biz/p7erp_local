import * as React from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DatePickerProps {
  date: Date | { from: Date; to: Date } | undefined;
  setDate: (date: { from: Date; to: Date } | Date | undefined) => void;
  placeholder?: string;
  className?: string;
}

export function DatePicker({
  date,
  setDate,
  placeholder = "Pick a date",
  className,
}: DatePickerProps) {
  return (
    <div className={cn("grid gap-2", className)}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant={"outline"}
            className={cn(
              "w-[300px] justify-start text-left font-normal",
              !date && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {date instanceof Date ? (
              format(date, "PPP")
            ) : date?.from ? (
              date.to ? (
                <>
                  {format(date.from, "PPP")} - {format(date.to, "PPP")}
                </>
              ) : (
                format(date.from, "PPP")
              )
            ) : (
              <span>{placeholder}</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            initialFocus
            mode="single"
            selected={date instanceof Date ? date : undefined}
            onSelect={(date) => setDate(date || undefined)}
            disabled={(date) => date < new Date("1900-01-01")}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}