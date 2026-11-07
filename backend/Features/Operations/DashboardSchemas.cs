namespace OrderCraft.Schemas;

public class DashboardSummaryResponse
{
    public OrderDashboardStats Orders { get; set; } = new();
    public InvoiceDashboardStats Invoices { get; set; } = new();
    public PartnerDashboardStats Partners { get; set; } = new();
    public int ProductCount { get; set; }
    public EmployeeDashboardStats Employees { get; set; } = new();
    public List<DashboardAttentionItem> Attention { get; set; } = [];
    public List<DashboardActivityItem> RecentActivity { get; set; } = [];
}

public class OrderDashboardStats
{
    public int Total { get; set; }
    public int Draft { get; set; }
    public int Pending { get; set; }
    public int Approved { get; set; }
}

public class InvoiceDashboardStats
{
    public int Total { get; set; }
    public int Unpaid { get; set; }
    public int PartiallyPaid { get; set; }
    public int Paid { get; set; }
    public int Overdue { get; set; }
    public decimal OutstandingAmount { get; set; }
}

public class PartnerDashboardStats
{
    public int Clients { get; set; }
    public int Vendors { get; set; }
}

public class EmployeeDashboardStats
{
    public int Active { get; set; }
    public int Total { get; set; }
}

public class DashboardAttentionItem
{
    public string Key { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
    public int Count { get; set; }
    public string Href { get; set; } = string.Empty;
}

public class DashboardActivityItem
{
    public Guid Id { get; set; }
    public string ActorName { get; set; } = string.Empty;
    public string Action { get; set; } = string.Empty;
    public string EntityType { get; set; } = string.Empty;
    public string? EntityLabel { get; set; }
    public string? Summary { get; set; }
    public DateTime CreatedAt { get; set; }
}
