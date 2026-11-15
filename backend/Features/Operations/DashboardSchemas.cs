namespace OrderCraft.Schemas;

public class DashboardSummaryResponse
{
    public OrderDashboardStats Orders { get; set; } = new();
    public InvoiceDashboardStats Invoices { get; set; } = new();
    public PartnerDashboardStats Partners { get; set; } = new();
    public int ProductCount { get; set; }
    public MetricTrend? ProductTrend { get; set; }
    public EmployeeDashboardStats Employees { get; set; } = new();
    public List<DashboardAttentionItem> Attention { get; set; } = [];
    public List<DashboardActivityItem> RecentActivity { get; set; } = [];
    public List<MonthlyVolumePoint> MonthlyVolumes { get; set; } = [];
    public DashboardProgressStats Progress { get; set; } = new();
    public string? TopVendorName { get; set; }
    public string? TopClientName { get; set; }
}

public class MonthlyVolumePoint
{
    public string Month { get; set; } = string.Empty;
    public decimal PurchaseAmount { get; set; }
    public decimal SaleAmount { get; set; }
}

public class DashboardProgressStats
{
    /// <summary>Share of invoices that are fully paid (0–100).</summary>
    public decimal PaidInvoicePercent { get; set; }
    /// <summary>Share of orders that are approved or beyond (0–100).</summary>
    public decimal FulfilledOrderPercent { get; set; }
}

public class MetricTrend
{
    public int CurrentPeriod { get; set; }
    public int PreviousPeriod { get; set; }
    public decimal? DeltaPercent { get; set; }
}

public class OrderDashboardStats
{
    public int Total { get; set; }
    public int Draft { get; set; }
    public int Pending { get; set; }
    public int Approved { get; set; }
    public MetricTrend? TotalTrend { get; set; }
    public MetricTrend? ApprovedTrend { get; set; }
}

public class InvoiceDashboardStats
{
    public int Total { get; set; }
    public int Unpaid { get; set; }
    public int PartiallyPaid { get; set; }
    public int Paid { get; set; }
    public int Overdue { get; set; }
    public decimal OutstandingAmount { get; set; }
    public MetricTrend? OpenTrend { get; set; }
}

public class PartnerDashboardStats
{
    public int Clients { get; set; }
    public int Vendors { get; set; }
    public MetricTrend? TotalTrend { get; set; }
}

public class EmployeeDashboardStats
{
    public int Active { get; set; }
    public int Total { get; set; }
    public MetricTrend? ActiveTrend { get; set; }
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
