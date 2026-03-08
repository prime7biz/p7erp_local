// User types
export interface User {
  id: number;
  username: string;
  email: string;
  password: string;
  firstName?: string | null;
  lastName?: string | null;
  tenantId: number;
  role: string;
  isActive: boolean;
  lastLogin?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  tenant?: Tenant;
}

// Tenant types
export interface Tenant {
  id: number;
  name: string;
  domain: string;
  logo?: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  subscription?: string;
}

// Subscription types
export interface Subscription {
  id: number;
  tenantId: number;
  plan: string;
  status: string;
  startDate: Date;
  endDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Dashboard data types
export interface KPICard {
  id: string;
  title: string;
  value: string | number;
  change: number;
  changeLabel: string;
  icon: string;
  iconBgColor: string;
  iconColor: string;
}

export interface AIInsight {
  id: number;
  type: 'warning' | 'info' | 'success';
  title: string;
  description: string;
  actionText: string;
  actionLink: string;
  icon: string;
}

export interface ProductionTrend {
  date: string;
  efficiency: number;
  output: number;
  defects: number;
  target: number;
}

export interface Order {
  id: string;
  orderId: string;
  customer: string;
  items: string;
  value: string;
  status: 'in_production' | 'material_sourcing' | 'quality_check' | 'completed';
  deadline: string;
  isAtRisk: boolean;
}

export interface Task {
  id: string;
  title: string;
  dueTime: string;
  priority: 'urgent' | 'important' | 'medium' | 'standard';
  completed: boolean;
}

export interface TaskList {
  today: Task[];
  upcoming: Task[];
  completed: Task[];
}

export interface Attendee {
  id: string;
  name: string;
  initials: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  location: string;
  startTime: string;
  category: 'meeting' | 'buyer' | 'quality' | 'other';
  attendees: Attendee[];
}

export interface SupplyChainStatus {
  id: string;
  title: string;
  status: 'on_track' | 'minor_delays' | 'issues' | 'excellent';
  statusText: string;
  description: string;
}
