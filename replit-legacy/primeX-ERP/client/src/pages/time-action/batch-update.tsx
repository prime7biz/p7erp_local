import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { motion } from 'framer-motion';

// UI Components
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

export default function BatchUpdateMilestones() {
  const { toast } = useToast();
  const [selectedPlan, setSelectedPlan] = useState<string>('');
  const [selectedMilestones, setSelectedMilestones] = useState<string[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [updateField, setUpdateField] = useState<string>('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [comments, setComments] = useState('');
  
  // Fetch all plans
  const { data: plans = [] } = useQuery({
    queryKey: ['/api/time-action-plans'],
  });
  
  // Fetch milestones for selected plan
  const { data: milestones = [], isLoading: milestonesLoading } = useQuery({
    queryKey: [`/api/time-action-milestones/${selectedPlan}`],
    enabled: !!selectedPlan,
  });
  
  // Batch update mutation
  const batchUpdateMutation = useMutation({
    mutationFn: (data: any) => {
      return apiRequest('/api/time-action-milestones/batch', 'PATCH', data);
    },
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Milestones updated successfully',
        variant: 'default',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/time-action-milestones/plan', selectedPlan] });
      setSelectedMilestones([]);
      setDialogOpen(false);
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: 'Failed to update milestones. Please try again.',
        variant: 'destructive',
      });
    },
  });
  
  const handleSelectAll = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.checked) {
      setSelectedMilestones(milestones.map((milestone: any) => milestone.id.toString()));
    } else {
      setSelectedMilestones([]);
    }
  };
  
  const handleCheckboxChange = (id: string) => {
    setSelectedMilestones(prev => {
      if (prev.includes(id)) {
        return prev.filter(milestoneId => milestoneId !== id);
      } else {
        return [...prev, id];
      }
    });
  };
  
  const handleBatchUpdate = () => {
    if (selectedMilestones.length === 0) {
      toast({
        title: 'Warning',
        description: 'Please select at least one milestone to update',
        variant: 'warning',
      });
      return;
    }
    
    if (!updateField) {
      toast({
        title: 'Warning',
        description: 'Please select what you want to update',
        variant: 'warning',
      });
      return;
    }
    
    let updateData: any = {
      milestoneIds: selectedMilestones,
      updateField,
      comments,
    };
    
    // Add the appropriate field based on what's being updated
    switch (updateField) {
      case 'status':
        if (!selectedStatus) {
          toast({
            title: 'Warning',
            description: 'Please select a status',
            variant: 'warning',
          });
          return;
        }
        updateData.status = selectedStatus;
        break;
      case 'department':
        if (!selectedDepartment) {
          toast({
            title: 'Warning',
            description: 'Please select a department',
            variant: 'warning',
          });
          return;
        }
        updateData.department = selectedDepartment;
        break;
      case 'plannedStartDate':
      case 'plannedEndDate':
      case 'actualStartDate':
      case 'actualEndDate':
        if (!selectedDate) {
          toast({
            title: 'Warning',
            description: 'Please select a date',
            variant: 'warning',
          });
          return;
        }
        updateData.date = selectedDate.toISOString();
        break;
      default:
        break;
    }
    
    batchUpdateMutation.mutate(updateData);
  };
  
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Completed':
        return <Badge className="bg-green-500">Completed</Badge>;
      case 'In Progress':
        return <Badge className="bg-amber-500">In Progress</Badge>;
      case 'Delayed':
        return <Badge className="bg-red-500">Delayed</Badge>;
      case 'At Risk':
        return <Badge className="bg-orange-500">At Risk</Badge>;
      case 'Not Started':
        return <Badge className="bg-blue-500">Not Started</Badge>;
      default:
        return <Badge className="bg-slate-500">{status}</Badge>;
    }
  };
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle>Batch Update Milestones</CardTitle>
          <CardDescription>
            Efficiently update multiple milestones at once to save time
          </CardDescription>
          <div className="flex items-center space-x-4 mt-4">
            <Select value={selectedPlan} onValueChange={setSelectedPlan}>
              <SelectTrigger className="w-[300px]">
                <SelectValue placeholder="Select a Time & Action Plan" />
              </SelectTrigger>
              <SelectContent>
                {Array.isArray(plans) && plans.map((plan: any) => (
                  <SelectItem key={plan.id} value={plan.id.toString()}>
                    {plan.name} ({plan.orderReference || 'No order reference'})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Button
              variant="outline"
              className="ml-auto"
              disabled={selectedMilestones.length === 0}
              onClick={() => setDialogOpen(true)}
            >
              Update Selected ({selectedMilestones.length})
            </Button>
          </div>
        </CardHeader>
        
        <CardContent>
          {milestonesLoading ? (
            <div className="h-80 flex items-center justify-center">
              <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
            </div>
          ) : !selectedPlan ? (
            <div className="h-80 flex items-center justify-center text-muted-foreground">
              Please select a Time & Action Plan to view milestones
            </div>
          ) : milestones.length === 0 ? (
            <div className="h-80 flex items-center justify-center text-muted-foreground">
              No milestones found for this plan
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">
                      <Checkbox 
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedMilestones(milestones.map((m: any) => m.id.toString()));
                          } else {
                            setSelectedMilestones([]);
                          }
                        }}
                        checked={selectedMilestones.length === milestones.length && milestones.length > 0}
                      />
                    </TableHead>
                    <TableHead className="w-[200px]">Milestone</TableHead>
                    <TableHead className="w-[120px]">Department</TableHead>
                    <TableHead className="w-[120px]">Status</TableHead>
                    <TableHead className="w-[120px]">Planned Start</TableHead>
                    <TableHead className="w-[120px]">Planned End</TableHead>
                    <TableHead className="w-[120px]">Actual Start</TableHead>
                    <TableHead className="w-[120px]">Actual End</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Array.isArray(milestones) && milestones.map((milestone: any) => (
                    <TableRow key={milestone.id}>
                      <TableCell>
                        <Checkbox 
                          checked={selectedMilestones.includes(milestone.id.toString())}
                          onCheckedChange={() => handleCheckboxChange(milestone.id.toString())}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{milestone.milestoneName}</TableCell>
                      <TableCell>{milestone.department}</TableCell>
                      <TableCell>{getStatusBadge(milestone.status)}</TableCell>
                      <TableCell>{milestone.plannedStartDate ? format(new Date(milestone.plannedStartDate), 'MMM dd, yyyy') : '-'}</TableCell>
                      <TableCell>{milestone.plannedEndDate ? format(new Date(milestone.plannedEndDate), 'MMM dd, yyyy') : '-'}</TableCell>
                      <TableCell>{milestone.actualStartDate ? format(new Date(milestone.actualStartDate), 'MMM dd, yyyy') : '-'}</TableCell>
                      <TableCell>{milestone.actualEndDate ? format(new Date(milestone.actualEndDate), 'MMM dd, yyyy') : '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Batch Update {selectedMilestones.length} Milestones</DialogTitle>
            <DialogDescription>
              Apply the same change to multiple milestones at once.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="update-field">What do you want to update?</Label>
              <Select value={updateField} onValueChange={setUpdateField}>
                <SelectTrigger id="update-field">
                  <SelectValue placeholder="Select field to update" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="status">Status</SelectItem>
                  <SelectItem value="department">Department</SelectItem>
                  <SelectItem value="plannedStartDate">Planned Start Date</SelectItem>
                  <SelectItem value="plannedEndDate">Planned End Date</SelectItem>
                  <SelectItem value="actualStartDate">Actual Start Date</SelectItem>
                  <SelectItem value="actualEndDate">Actual End Date</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* Dynamic form based on selected update field */}
            {updateField === 'status' && (
              <div className="grid gap-2">
                <Label htmlFor="status">New Status</Label>
                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                  <SelectTrigger id="status">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Not Started">Not Started</SelectItem>
                    <SelectItem value="In Progress">In Progress</SelectItem>
                    <SelectItem value="Completed">Completed</SelectItem>
                    <SelectItem value="Delayed">Delayed</SelectItem>
                    <SelectItem value="At Risk">At Risk</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            
            {updateField === 'department' && (
              <div className="grid gap-2">
                <Label htmlFor="department">New Department</Label>
                <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                  <SelectTrigger id="department">
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Production">Production</SelectItem>
                    <SelectItem value="Merchandising">Merchandising</SelectItem>
                    <SelectItem value="Quality Control">Quality Control</SelectItem>
                    <SelectItem value="Fabric">Fabric</SelectItem>
                    <SelectItem value="Cutting">Cutting</SelectItem>
                    <SelectItem value="Sewing">Sewing</SelectItem>
                    <SelectItem value="Finishing">Finishing</SelectItem>
                    <SelectItem value="Packaging">Packaging</SelectItem>
                    <SelectItem value="Shipping">Shipping</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            
            {(updateField === 'plannedStartDate' || 
              updateField === 'plannedEndDate' || 
              updateField === 'actualStartDate' || 
              updateField === 'actualEndDate') && (
              <div className="grid gap-2">
                <Label htmlFor="date">New Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                    >
                      {selectedDate ? format(selectedDate, 'PPP') : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={setSelectedDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            )}
            
            <div className="grid gap-2">
              <Label htmlFor="comments">Comments (Optional)</Label>
              <Input
                id="comments"
                placeholder="Add any comments about this update"
                value={comments}
                onChange={(e) => setComments(e.target.value)}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button 
              onClick={handleBatchUpdate} 
              disabled={batchUpdateMutation.isPending}
            >
              {batchUpdateMutation.isPending ? 'Updating...' : 'Update Milestones'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}