import React from "react";
import {
  AreaChart as TremorAreaChart,
  BarChart as TremorBarChart,
  LineChart as TremorLineChart,
  DonutChart as TremorDonutChart,
  Card,
  Title,
} from "@tremor/react";

interface ChartProps {
  data: any[];
  index: string;
  categories: string[];
  colors?: string[];
  valueFormatter?: (value: number) => string;
  stack?: boolean;
  startEndOnly?: boolean;
  showLegend?: boolean;
  showXAxis?: boolean;
  showYAxis?: boolean;
  showAnimation?: boolean;
  height?: string;
}

interface PieChartProps {
  data: any[];
  index: string;
  category: string;
  valueFormatter?: (value: number) => string;
  showAnimation?: boolean;
  showLabel?: boolean;
  height?: string;
}

export const AreaChart = ({
  data,
  index,
  categories,
  colors = ["blue", "cyan", "indigo"],
  valueFormatter = (value) => `${value.toLocaleString()}`,
  startEndOnly = false,
  showLegend = true,
  showXAxis = true,
  showYAxis = true,
  showAnimation = true,
  height = "h-72"
}: ChartProps) => {
  return (
    <TremorAreaChart
      className={height}
      data={data}
      index={index}
      categories={categories}
      colors={colors}
      valueFormatter={valueFormatter}
      startEndOnly={startEndOnly}
      showLegend={showLegend}
      showXAxis={showXAxis}
      showYAxis={showYAxis}
      showAnimation={showAnimation}
      yAxisWidth={65}
    />
  );
};

export const BarChart = ({
  data,
  index,
  categories,
  colors = ["blue", "cyan", "indigo"],
  valueFormatter = (value) => `${value.toLocaleString()}`,
  stack = false,
  showLegend = true,
  showXAxis = true,
  showYAxis = true,
  showAnimation = true,
  height = "h-72"
}: ChartProps) => {
  return (
    <TremorBarChart
      className={height}
      data={data}
      index={index}
      categories={categories}
      colors={colors}
      valueFormatter={valueFormatter}
      stack={stack}
      showLegend={showLegend}
      showXAxis={showXAxis}
      showYAxis={showYAxis}
      showAnimation={showAnimation}
      yAxisWidth={65}
    />
  );
};

export const LineChart = ({
  data,
  index,
  categories,
  colors = ["blue", "cyan", "indigo"],
  valueFormatter = (value) => `${value.toLocaleString()}`,
  showLegend = true,
  showXAxis = true,
  showYAxis = true,
  showAnimation = true,
  height = "h-72"
}: ChartProps) => {
  return (
    <TremorLineChart
      className={height}
      data={data}
      index={index}
      categories={categories}
      colors={colors}
      valueFormatter={valueFormatter}
      showLegend={showLegend}
      showXAxis={showXAxis}
      showYAxis={showYAxis}
      showAnimation={showAnimation}
      yAxisWidth={65}
    />
  );
};

export const DonutChart = ({
  data,
  index,
  category,
  valueFormatter = (value) => `${value.toLocaleString()}`,
  showAnimation = true,
  showLabel = true,
  height = "h-72"
}: PieChartProps) => {
  return (
    <TremorDonutChart
      className={height}
      data={data}
      index={index}
      category={category}
      valueFormatter={valueFormatter}
      showAnimation={showAnimation}
      showLabel={showLabel}
    />
  );
};

// Use DonutChart as PieChart since Tremor doesn't export a separate PieChart component
export const PieChart = ({
  data,
  index,
  category,
  valueFormatter = (value) => `${value.toLocaleString()}`,
  showAnimation = true,
  showLabel = true,
  height = "h-72"
}: PieChartProps) => {
  return (
    <TremorDonutChart
      className={height}
      data={data}
      index={index}
      category={category}
      valueFormatter={valueFormatter}
      showAnimation={showAnimation}
      showLabel={showLabel}
    />
  );
};