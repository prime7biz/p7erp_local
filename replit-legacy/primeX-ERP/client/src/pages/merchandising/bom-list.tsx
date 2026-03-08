import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Calculator, Eye, Plus, Shirt } from "lucide-react";
import DashboardLayout from "@/components/layout/dashboard-layout";
import Spinner from "@/components/ui/spinner";

interface Style {
  id: number;
  styleNo: string;
  season?: string;
  productType?: string;
  description?: string;
  status: string;
  buyerId?: number;
}

export default function BomListPage() {
  const { data: stylesResponse, isLoading } = useQuery<any>({
    queryKey: ["/api/merch/styles"],
  });
  const styles: Style[] = Array.isArray(stylesResponse) ? stylesResponse : (stylesResponse?.data || []);

  const statusColor = (status: string) => {
    switch (status?.toUpperCase()) {
      case "ACTIVE":
        return "bg-green-100 text-green-700";
      case "DRAFT":
        return "bg-gray-100 text-gray-700";
      case "APPROVED":
        return "bg-blue-100 text-blue-700";
      default:
        return "bg-gray-100 text-gray-600";
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Calculator className="h-6 w-6 text-primary" />
              Bill of Materials
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Select a style to view or create its BOM
            </p>
          </div>
          <Link href="/merchandising/styles">
            <Button variant="outline" className="gap-2">
              <Plus className="h-4 w-4" />
              Create Style First
            </Button>
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Shirt className="h-5 w-5" />
              Styles with BOM
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Spinner />
              </div>
            ) : !styles || styles.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Shirt className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                <p className="font-medium">No styles found</p>
                <p className="text-sm mt-1">Create a style first, then build its BOM</p>
                <Link href="/merchandising/styles">
                  <Button className="mt-4" variant="outline">
                    Go to Styles
                  </Button>
                </Link>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Style No</TableHead>
                    <TableHead>Season</TableHead>
                    <TableHead>Product Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {styles.map((style) => (
                    <TableRow key={style.id}>
                      <TableCell className="font-medium">{style.styleNo}</TableCell>
                      <TableCell>{style.season || "-"}</TableCell>
                      <TableCell>{style.productType || "-"}</TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {style.description || "-"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusColor(style.status)}>
                          {style.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Link href={`/bom/styles/${style.id}`}>
                          <Button size="sm" variant="outline" className="gap-1">
                            <Eye className="h-4 w-4" />
                            View BOM
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
