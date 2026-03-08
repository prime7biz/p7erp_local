import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

type TimeRange = "weekly" | "monthly" | "quarterly";

interface ProductionTrendsData {
  date: string;
  efficiency: number;
  output: number;
  defects: number;
  target: number;
}

export const ProductionTrends = () => {
  const [timeRange, setTimeRange] = useState<TimeRange>("weekly");

  const { data, isLoading } = useQuery<ProductionTrendsData[]>({
    queryKey: ["/api/dashboard/production-trends", timeRange],
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const handleRangeChange = (value: string) => {
    setTimeRange(value as TimeRange);
  };

  return (
    <Card className="bg-neutral-lightest rounded-lg shadow-sm">
      <CardHeader className="p-6 pb-0 flex flex-col md:flex-row md:items-center md:justify-between space-y-2 md:space-y-0">
        <CardTitle className="font-heading font-medium text-lg text-neutral-darkest">
          Production Trends
        </CardTitle>
        <Tabs value={timeRange} onValueChange={handleRangeChange}>
          <TabsList className="h-auto bg-neutral-light">
            <TabsTrigger
              value="weekly"
              className={`px-3 py-1 text-xs font-medium rounded-full ${
                timeRange === "weekly"
                  ? "bg-primary text-white"
                  : "bg-neutral-light text-neutral-dark"
              }`}
            >
              Weekly
            </TabsTrigger>
            <TabsTrigger
              value="monthly"
              className={`px-3 py-1 text-xs font-medium rounded-full ${
                timeRange === "monthly"
                  ? "bg-primary text-white"
                  : "bg-neutral-light text-neutral-dark"
              }`}
            >
              Monthly
            </TabsTrigger>
            <TabsTrigger
              value="quarterly"
              className={`px-3 py-1 text-xs font-medium rounded-full ${
                timeRange === "quarterly"
                  ? "bg-primary text-white"
                  : "bg-neutral-light text-neutral-dark"
              }`}
            >
              Quarterly
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent className="p-4 sm:p-6">
        <div className="chart-container h-[300px] md:h-[350px]">
          {isLoading ? (
            <div className="h-full w-full flex items-center justify-center">
              <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary"></div>
            </div>
          ) : !data || data.length === 0 ? (
            <div className="h-full w-full flex flex-col items-center justify-center">
              <span className="material-icons text-3xl sm:text-4xl text-neutral-dark mb-2">
                insights
              </span>
              <h3 className="font-medium text-neutral-darkest mb-1 text-center">
                No trend data available
              </h3>
              <p className="text-sm text-neutral-dark text-center px-2">
                Production data will appear here once available.
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={data}
                margin={{ 
                  top: 5, 
                  right: 5, 
                  left: 0, 
                  bottom: 5 
                }}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 10 }}
                  tickMargin={5}
                />
                <YAxis 
                  tick={{ fontSize: 10 }}
                  width={30}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: "8px",
                    backgroundColor: "#fff",
                    borderColor: "#e0e0e0",
                    fontSize: '12px',
                  }}
                />
                <Legend 
                  verticalAlign="bottom" 
                  height={36} 
                  wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }}
                />
                <Line
                  type="monotone"
                  dataKey="efficiency"
                  stroke="#3f51b5"
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  activeDot={{ r: 5 }}
                  name="Efficiency (%)"
                />
                <Line
                  type="monotone"
                  dataKey="output"
                  stroke="#f50057"
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  activeDot={{ r: 5 }}
                  name="Output (units)"
                />
                <Line
                  type="monotone"
                  dataKey="defects"
                  stroke="#ff9800"
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  activeDot={{ r: 5 }}
                  name="Defects (%)"
                />
                <Line
                  type="monotone"
                  dataKey="target"
                  stroke="#4caf50"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={false}
                  name="Target"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
