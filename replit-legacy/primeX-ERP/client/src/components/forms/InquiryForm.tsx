import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";

// Form schema with validation
const formSchema = z.object({
  customerId: z.coerce.number({
    required_error: "Customer is required",
  }),
  contactPersonId: z.coerce.number().optional(),
  styleName: z.string().min(2, {
    message: "Style name must be at least 2 characters.",
  }),
  inquiryType: z.enum(["Sample Development", "Salesman Sample", "Quotation", "Repeat Order"], {
    required_error: "Please select an inquiry type.",
  }),
  department: z.enum(["Infant", "Kids", "Boys", "Girls", "Men's", "Ladies"], {
    required_error: "Please select a department.",
  }),
  season: z.string().optional(),
  brand: z.string().optional(),
  materialComposition: z.string().optional(),
  colorOptions: z.array(z.string()).optional(),
  sizeRange: z.string().optional(),
  countryOfOrigin: z.string().optional().default("Bangladesh"),
  incoterms: z.string().optional(),
  specialRequirements: z.string().optional(),
  projectedQuantity: z.coerce.number({
    required_error: "Projected quantity is required",
  }).min(1, {
    message: "Quantity must be at least 1.",
  }),
  projectedDeliveryDate: z.date({
    required_error: "Projected delivery date is required.",
  }),
  targetPrice: z.coerce.number({
    required_error: "Target price is required",
  }).min(0.01, {
    message: "Price must be greater than 0.",
  }),
  technicalFiles: z.array(z.string()).optional(),
});

type FormValues = z.infer<typeof formSchema>;

type InquiryFormProps = {
  inquiry?: any;
  isEditing: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export default function InquiryForm({ inquiry, isEditing, onClose, onSuccess }: InquiryFormProps) {
  const queryClient = useQueryClient();
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);

  // Fetch customers for dropdown
  const { data: customers, isLoading: isLoadingCustomers } = useQuery({
    queryKey: ["/api/customers"],
  });

  // Initialize form with default values or values from the inquiry being edited
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: isEditing 
      ? {
          customerId: inquiry.customerId,
          contactPersonId: inquiry.contactPersonId,
          styleName: inquiry.styleName,
          inquiryType: inquiry.inquiryType,
          department: inquiry.department,
          season: inquiry.season || "",
          brand: inquiry.brand || "",
          materialComposition: inquiry.materialComposition || "",
          colorOptions: inquiry.colorOptions || [],
          sizeRange: inquiry.sizeRange || "",
          projectedQuantity: inquiry.projectedQuantity,
          projectedDeliveryDate: new Date(inquiry.projectedDeliveryDate),
          targetPrice: inquiry.targetPrice,
          countryOfOrigin: inquiry.countryOfOrigin || "Bangladesh",
          incoterms: inquiry.incoterms || "",
          specialRequirements: inquiry.specialRequirements || "",
          technicalFiles: inquiry.technicalFiles || [],
        }
      : {
          customerId: undefined,
          contactPersonId: undefined,
          styleName: "",
          inquiryType: undefined,
          department: undefined,
          season: "",
          brand: "",
          materialComposition: "",
          colorOptions: [],
          sizeRange: "",
          projectedQuantity: undefined,
          projectedDeliveryDate: undefined,
          targetPrice: undefined,
          countryOfOrigin: "Bangladesh",
          incoterms: "",
          specialRequirements: "",
          technicalFiles: [],
        },
  });

  // When customer changes, update the selected customer to show agent information
  useEffect(() => {
    if (isEditing && customers && inquiry) {
      const customer = customers.find((c: any) => c.id === inquiry.customerId);
      if (customer) {
        setSelectedCustomer(customer);
      }
    }
  }, [isEditing, customers, inquiry]);

  // Handle customer selection change
  const handleCustomerChange = (value: string) => {
    const customerId = Number(value);
    if (customers) {
      const customer = customers.find((c: any) => c.id === customerId);
      setSelectedCustomer(customer);
    }
    form.setValue("customerId", customerId);
  };

  // File upload simulation - in a real app this would upload to a server/cloud storage
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = event.target.files;
    if (uploadedFiles && uploadedFiles.length > 0) {
      // Convert FileList to array and limit to 5 files max
      const newFiles = Array.from(uploadedFiles).slice(0, 5 - files.length);
      setFiles((prevFiles) => [...prevFiles, ...newFiles]);
      
      // In a real app, you would upload these files to a server and get back URLs
      // For this example, we'll just simulate the process
      setUploading(true);
      setTimeout(() => {
        // Simulate file uploads completing and returning URLs
        const simulatedUrls = newFiles.map((file) => `uploads/${file.name}`);
        setUploadedFiles(prev => [...prev, ...simulatedUrls]);
        form.setValue("technicalFiles", [...form.getValues("technicalFiles") || [], ...simulatedUrls]);
        setUploading(false);
      }, 1000);
    }
  };

  // Remove a file from the list
  const removeFile = (index: number) => {
    const newFiles = [...files];
    newFiles.splice(index, 1);
    setFiles(newFiles);

    const newUploadedFiles = [...uploadedFiles];
    newUploadedFiles.splice(index, 1);
    setUploadedFiles(newUploadedFiles);
    form.setValue("technicalFiles", newUploadedFiles);
  };

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: FormValues) => {
      return apiRequest("/api/inquiries", "POST", data);
    },
    onSuccess: () => {
      toast({
        title: "Inquiry created",
        description: "The inquiry has been created successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/inquiries"] });
      onSuccess();
    },
    onError: (error) => {
      toast({
        title: "Failed to create inquiry",
        description: "There was an error creating the inquiry. Please try again.",
        variant: "destructive",
      });
      console.error("Create error:", error);
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (data: FormValues) => {
      return apiRequest(`/api/inquiries/${inquiry.id}`, "PATCH", data);
    },
    onSuccess: () => {
      toast({
        title: "Inquiry updated",
        description: "The inquiry has been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/inquiries"] });
      onSuccess();
    },
    onError: (error) => {
      toast({
        title: "Failed to update inquiry",
        description: "There was an error updating the inquiry. Please try again.",
        variant: "destructive",
      });
      console.error("Update error:", error);
    },
  });

  // Form submission handler
  const onSubmit = (data: FormValues) => {
    if (isEditing) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  // Loading state for the form
  const isLoading = createMutation.isPending || updateMutation.isPending || uploading;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Customer Selection */}
          <FormField
            control={form.control}
            name="customerId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Customer <span className="text-destructive">*</span></FormLabel>
                <Select 
                  onValueChange={handleCustomerChange}
                  defaultValue={field.value?.toString()}
                  disabled={isLoading}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a customer" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {isLoadingCustomers ? (
                      <div className="flex items-center justify-center p-4">
                        <span className="text-sm text-muted-foreground">Loading customers...</span>
                      </div>
                    ) : customers?.length > 0 ? (
                      customers.map((customer: any) => (
                        <SelectItem key={customer.id} value={customer.id.toString()}>
                          {customer.customerName}
                        </SelectItem>
                      ))
                    ) : (
                      <div className="flex items-center justify-center p-4">
                        <span className="text-sm text-muted-foreground">No customers found</span>
                      </div>
                    )}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Agent Information (read-only) */}
          <div>
            <FormLabel>Agent</FormLabel>
            <div className="mt-2 h-10 px-3 py-2 rounded-md border border-input bg-background text-sm">
              {selectedCustomer ? (
                selectedCustomer.hasAgent ? (
                  <span>{selectedCustomer.agentName || "Agent name not provided"}</span>
                ) : (
                  <span className="text-muted-foreground">No agent</span>
                )
              ) : (
                <span className="text-muted-foreground">Select a customer to see agent</span>
              )}
            </div>
          </div>

          {/* Style Name */}
          <FormField
            control={form.control}
            name="styleName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Style Name <span className="text-destructive">*</span></FormLabel>
                <FormControl>
                  <Input 
                    placeholder="Enter style name" 
                    {...field} 
                    disabled={isLoading}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Inquiry Type */}
          <FormField
            control={form.control}
            name="inquiryType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Inquiry Type <span className="text-destructive">*</span></FormLabel>
                <Select 
                  onValueChange={field.onChange} 
                  defaultValue={field.value}
                  disabled={isLoading}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select inquiry type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="Sample Development">Sample Development</SelectItem>
                    <SelectItem value="Salesman Sample">Salesman Sample</SelectItem>
                    <SelectItem value="Quotation">Quotation</SelectItem>
                    <SelectItem value="Repeat Order">Repeat Order</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Department */}
          <FormField
            control={form.control}
            name="department"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Department <span className="text-destructive">*</span></FormLabel>
                <Select 
                  onValueChange={field.onChange} 
                  defaultValue={field.value}
                  disabled={isLoading}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select department" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="Infant">Infant</SelectItem>
                    <SelectItem value="Kids">Kids</SelectItem>
                    <SelectItem value="Boys">Boys</SelectItem>
                    <SelectItem value="Girls">Girls</SelectItem>
                    <SelectItem value="Men's">Men's</SelectItem>
                    <SelectItem value="Ladies">Ladies</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Projected Quantity */}
          <FormField
            control={form.control}
            name="projectedQuantity"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Projected Quantity <span className="text-destructive">*</span></FormLabel>
                <FormControl>
                  <Input 
                    type="number" 
                    min="1" 
                    placeholder="Enter quantity"
                    {...field}
                    disabled={isLoading}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Projected Delivery Date */}
          <FormField
            control={form.control}
            name="projectedDeliveryDate"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Projected Delivery Date <span className="text-destructive">*</span></FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant={"outline"}
                        className={cn(
                          "w-full pl-3 text-left font-normal",
                          !field.value && "text-muted-foreground"
                        )}
                        disabled={isLoading}
                      >
                        {field.value ? (
                          format(field.value, "PPP")
                        ) : (
                          <span>Pick a date</span>
                        )}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={field.value}
                      onSelect={field.onChange}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Target Price */}
          <FormField
            control={form.control}
            name="targetPrice"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Target Price (BDT) <span className="text-destructive">*</span></FormLabel>
                <FormControl>
                  <Input 
                    type="number" 
                    min="0.01" 
                    step="0.01"
                    placeholder="Enter target price"
                    {...field}
                    disabled={isLoading}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          {/* Season/Year */}
          <FormField
            control={form.control}
            name="season"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Season/Year</FormLabel>
                <Select 
                  onValueChange={field.onChange}
                  value={field.value || ""}
                  disabled={isLoading}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select season" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="SS2024">SS2024</SelectItem>
                    <SelectItem value="FW2024">FW2024</SelectItem>
                    <SelectItem value="SS2025">SS2025</SelectItem>
                    <SelectItem value="FW2025">FW2025</SelectItem>
                    <SelectItem value="SS2026">SS2026</SelectItem>
                    <SelectItem value="FW2026">FW2026</SelectItem>
                  </SelectContent>
                </Select>
                <FormDescription>Season and year for this product</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          
          {/* Brand */}
          <FormField
            control={form.control}
            name="brand"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Brand</FormLabel>
                <FormControl>
                  <Input 
                    placeholder="Enter brand name"
                    {...field}
                    disabled={isLoading}
                  />
                </FormControl>
                <FormDescription>Brand name for production</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Product Details Section */}
          <div className="col-span-2 mt-4 mb-2">
            <h3 className="text-lg font-medium mb-4 border-b pb-2">Product Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Material Composition */}
              <FormField
                control={form.control}
                name="materialComposition"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Material Composition</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="e.g., 95% Cotton, 5% Elastane"
                        {...field}
                        disabled={isLoading}
                      />
                    </FormControl>
                    <FormDescription>
                      Specify the fabric composition
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Size Range */}
              <FormField
                control={form.control}
                name="sizeRange"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Size Range</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="e.g., S-XXL, 28-36"
                        {...field}
                        disabled={isLoading}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Color Options */}
              <FormField
                control={form.control}
                name="colorOptions"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Color Options</FormLabel>
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-2 mb-2">
                        {field.value?.map((color, index) => (
                          <Badge 
                            key={index} 
                            className="flex items-center gap-1 py-1.5 px-3"
                            variant="outline"
                            style={{ borderColor: color }}
                          >
                            <div className="w-3 h-3 rounded-full mr-1" style={{ backgroundColor: color }} />
                            {color}
                            <button 
                              type="button" 
                              onClick={() => {
                                const updatedColors = [...field.value];
                                updatedColors.splice(index, 1);
                                field.onChange(updatedColors);
                              }}
                              className="ml-1 rounded-full hover:bg-destructive/20"
                              disabled={isLoading}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Input
                          type="color"
                          id="colorPicker"
                          className="w-12 h-8 p-0 overflow-hidden"
                          onChange={(e) => {
                            const colorValue = e.target.value;
                            if (!field.value?.includes(colorValue)) {
                              field.onChange([...(field.value || []), colorValue]);
                            }
                          }}
                          disabled={isLoading}
                        />
                        <Label htmlFor="colorPicker" className="text-sm">
                          Click to select colors
                        </Label>
                      </div>
                    </div>
                    <FormDescription>
                      Select the available color options for this product
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Country of Origin */}
              <FormField
                control={form.control}
                name="countryOfOrigin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Country of Origin</FormLabel>
                    <Select 
                      onValueChange={field.onChange}
                      value={field.value || "Bangladesh"}
                      disabled={isLoading}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select country" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Bangladesh">Bangladesh</SelectItem>
                        <SelectItem value="China">China</SelectItem>
                        <SelectItem value="India">India</SelectItem>
                        <SelectItem value="Vietnam">Vietnam</SelectItem>
                        <SelectItem value="Pakistan">Pakistan</SelectItem>
                        <SelectItem value="Cambodia">Cambodia</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>Manufacturing country</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Incoterms */}
              <FormField
                control={form.control}
                name="incoterms"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Incoterms</FormLabel>
                    <Select 
                      onValueChange={field.onChange}
                      value={field.value || ""}
                      disabled={isLoading}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select incoterms" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="FOB">FOB (Free on Board)</SelectItem>
                        <SelectItem value="CIF">CIF (Cost, Insurance & Freight)</SelectItem>
                        <SelectItem value="EXW">EXW (Ex Works)</SelectItem>
                        <SelectItem value="DDP">DDP (Delivered Duty Paid)</SelectItem>
                        <SelectItem value="CFR">CFR (Cost and Freight)</SelectItem>
                        <SelectItem value="FCA">FCA (Free Carrier)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      International Commercial Terms for shipping
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>
          
          {/* Special Requirements */}
          <FormField
            control={form.control}
            name="specialRequirements"
            render={({ field }) => (
              <FormItem className="col-span-2">
                <FormLabel>Special Requirements</FormLabel>
                <FormControl>
                  <textarea 
                    className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                    placeholder="Enter any special requirements or certifications needed"
                    {...field}
                    disabled={isLoading}
                  />
                </FormControl>
                <FormDescription>
                  Include any special instructions, compliance requirements, or certifications
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          
          {/* Contact Person */}
          <FormField
            control={form.control}
            name="contactPersonId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Contact Person (Your Ref.)</FormLabel>
                <Select 
                  onValueChange={(value) => field.onChange(value ? parseInt(value) : undefined)}
                  value={field.value?.toString() || ""}
                  disabled={isLoading || !selectedCustomer}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a contact person" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {selectedCustomer?.contacts?.length > 0 ? (
                      selectedCustomer.contacts.map((contact: any) => (
                        <SelectItem key={contact.id} value={contact.id.toString()}>
                          {contact.name} - {contact.designation}
                        </SelectItem>
                      ))
                    ) : (
                      <div className="flex items-center justify-center p-4">
                        <span className="text-sm text-muted-foreground">No contacts found</span>
                      </div>
                    )}
                  </SelectContent>
                </Select>
                <FormDescription>
                  Select the contact person from the customer's organization
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Technical Files */}
          <FormField
            control={form.control}
            name="technicalFiles"
            render={() => (
              <FormItem className="col-span-2">
                <FormLabel>Technical Files (Max 5)</FormLabel>
                <FormControl>
                  <div>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {files.map((file, index) => (
                        <Badge 
                          key={index} 
                          variant="outline"
                          className="flex items-center gap-1 py-1 px-3"
                        >
                          <span className="text-xs truncate max-w-40">{file.name}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-4 w-4 p-0"
                            onClick={() => removeFile(index)}
                            disabled={isLoading}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </Badge>
                      ))}
                    </div>
                    {files.length < 5 && (
                      <div className="flex items-center">
                        <Input
                          id="fileUpload"
                          type="file"
                          onChange={handleFileUpload}
                          className="hidden"
                          multiple
                          accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                          disabled={isLoading || files.length >= 5}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => document.getElementById('fileUpload')?.click()}
                          disabled={isLoading || files.length >= 5}
                          className="mr-2"
                        >
                          Upload Files
                        </Button>
                        <p className="text-xs text-muted-foreground">
                          {5 - files.length} file(s) remaining
                        </p>
                      </div>
                    )}
                  </div>
                </FormControl>
                <FormDescription>
                  Upload technical specifications, designs, or reference files (PDF, DOC, XLS, images)
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex justify-end gap-3 pt-3">
          <Button 
            type="button" 
            variant="outline" 
            onClick={onClose}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button 
            type="submit"
            disabled={isLoading}
            className="bg-primary hover:bg-primary/90"
          >
            {isLoading 
              ? "Processing..." 
              : isEditing 
                ? "Update Inquiry" 
                : "Create Inquiry"}
          </Button>
        </div>
      </form>
    </Form>
  );
}