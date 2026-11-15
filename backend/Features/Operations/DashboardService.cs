using System.Globalization;
using Microsoft.EntityFrameworkCore;
using OrderCraft.Models;
using OrderCraft.Schemas;

namespace OrderCraft.Services;

public class DashboardService : IDashboardService
{
    private readonly ApplicationDbContext _dbContext;
    private readonly ITenantContext _tenant;
    private readonly IPermissionService _permissions;

    public DashboardService(
        ApplicationDbContext dbContext,
        ITenantContext tenant,
        IPermissionService permissions)
    {
        _dbContext = dbContext;
        _tenant = tenant;
        _permissions = permissions;
    }

    public async Task<DashboardSummaryResponse> GetSummaryAsync(
        CancellationToken cancellationToken = default)
    {
        var userId = _tenant.UserId;
        var organizationId = _tenant.OrganizationId;
        var showFinanceMoney = _tenant.IsOrgAdmin || _tenant.Role == UserRole.Finance;

        var canOrders = await HasPageAsync(userId, organizationId, "purchaseOrders", cancellationToken);
        var canInvoices = await HasPageAsync(userId, organizationId, "invoices", cancellationToken);
        var canCompanies = await HasPageAsync(userId, organizationId, "companies", cancellationToken);
        var canProducts = await HasPageAsync(userId, organizationId, "products", cancellationToken);
        var canEmployees = await HasPageAsync(userId, organizationId, "employees", cancellationToken);
        var canAudit = await HasPageAsync(userId, organizationId, "auditLog", cancellationToken);

        var now = DateTime.UtcNow;
        var currentStart = now.AddDays(-30);
        var previousStart = now.AddDays(-60);

        var orderStats = new OrderDashboardStats();
        if (canOrders)
        {
            var orders = _dbContext.Orders.AsNoTracking().Where(o => !o.IsDeleted);
            orderStats = new OrderDashboardStats
            {
                Total = await orders.CountAsync(cancellationToken),
                Draft = await orders.CountAsync(o => o.Status == OrderStatus.Draft, cancellationToken),
                Pending = await orders.CountAsync(o => o.Status == OrderStatus.Pending, cancellationToken),
                Approved = await orders.CountAsync(o => o.Status == OrderStatus.Approved, cancellationToken),
                TotalTrend = await BuildTrendAsync(
                    orders.Where(o => o.OrderDate >= currentStart),
                    orders.Where(o => o.OrderDate >= previousStart && o.OrderDate < currentStart),
                    cancellationToken),
                ApprovedTrend = await BuildTrendAsync(
                    orders.Where(o => o.Status == OrderStatus.Approved && o.OrderDate >= currentStart),
                    orders.Where(o =>
                        o.Status == OrderStatus.Approved &&
                        o.OrderDate >= previousStart &&
                        o.OrderDate < currentStart),
                    cancellationToken),
            };
        }

        var invoiceStats = new InvoiceDashboardStats();
        if (showFinanceMoney && canInvoices)
        {
            var invoiceRows = await _dbContext.Invoices.AsNoTracking()
                .Where(i => !i.IsDeleted)
                .Include(i => i.Payments)
                .Include(i => i.Order)
                .ToListAsync(cancellationToken);
            var invoiceStatuses = invoiceRows.Select(invoice => InvoiceMoney.Status(invoice)).ToList();
            invoiceStats = new InvoiceDashboardStats
            {
                Total = invoiceRows.Count,
                Unpaid = invoiceStatuses.Count(s => s == InvoiceStatus.Unpaid),
                PartiallyPaid = invoiceStatuses.Count(s => s == InvoiceStatus.PartiallyPaid),
                Paid = invoiceStatuses.Count(s => s == InvoiceStatus.Paid),
                Overdue = invoiceStatuses.Count(s => s == InvoiceStatus.Overdue),
                OutstandingAmount = invoiceRows.Sum(InvoiceMoney.Outstanding),
                OpenTrend = BuildTrendFromCounts(
                    invoiceRows.Count(i =>
                        InvoiceMoney.Status(i) != InvoiceStatus.Paid &&
                        i.Order.OrderDate >= currentStart),
                    invoiceRows.Count(i =>
                        InvoiceMoney.Status(i) != InvoiceStatus.Paid &&
                        i.Order.OrderDate >= previousStart &&
                        i.Order.OrderDate < currentStart)),
            };
        }

        var partnerStats = new PartnerDashboardStats();
        if (canCompanies)
        {
            var companies = _dbContext.Companies.AsNoTracking().Where(c => !c.IsDeleted);
            partnerStats = new PartnerDashboardStats
            {
                Clients = await companies.CountAsync(
                    c => c.Type == CompanyType.Buyer || c.Type == CompanyType.Both,
                    cancellationToken),
                Vendors = await companies.CountAsync(
                    c => c.Type == CompanyType.Supplier || c.Type == CompanyType.Both,
                    cancellationToken),
                TotalTrend = await BuildTrendAsync(
                    companies.Where(c => c.CreatedAt >= currentStart),
                    companies.Where(c => c.CreatedAt >= previousStart && c.CreatedAt < currentStart),
                    cancellationToken),
            };
        }

        var employeeStats = new EmployeeDashboardStats();
        if (canEmployees)
        {
            var users = _dbContext.Users.AsNoTracking().Where(u => !u.IsDeleted);
            employeeStats = new EmployeeDashboardStats
            {
                Total = await users.CountAsync(cancellationToken),
                Active = await users.CountAsync(u => u.IsActive, cancellationToken),
                ActiveTrend = await BuildTrendAsync(
                    users.Where(u => u.IsActive && u.CreatedAt >= currentStart),
                    users.Where(u =>
                        u.IsActive &&
                        u.CreatedAt >= previousStart &&
                        u.CreatedAt < currentStart),
                    cancellationToken),
            };
        }

        var productCount = 0;
        if (canProducts)
        {
            productCount = await _dbContext.Products.AsNoTracking()
                .CountAsync(p => !p.IsDeleted, cancellationToken);
        }

        var attention = new List<DashboardAttentionItem>();
        if (canOrders && orderStats.Pending > 0)
        {
            attention.Add(new DashboardAttentionItem
            {
                Key = "pendingOrders",
                Label = "Purchase orders pending",
                Count = orderStats.Pending,
                Href = "/admin/purchase-orders?status=Pending"
            });
        }

        if (canOrders && orderStats.Draft > 0)
        {
            attention.Add(new DashboardAttentionItem
            {
                Key = "draftOrders",
                Label = "Draft purchase orders",
                Count = orderStats.Draft,
                Href = "/admin/purchase-orders?status=Draft"
            });
        }

        if (showFinanceMoney && canInvoices)
        {
            var openInvoices = invoiceStats.Unpaid + invoiceStats.PartiallyPaid + invoiceStats.Overdue;
            if (openInvoices > 0)
            {
                attention.Add(new DashboardAttentionItem
                {
                    Key = "openInvoices",
                    Label = "Open invoices",
                    Count = openInvoices,
                    Href = "/admin/invoices?status=Open"
                });
            }

            if (invoiceStats.Unpaid > 0)
            {
                attention.Add(new DashboardAttentionItem
                {
                    Key = "unpaidInvoices",
                    Label = "Unpaid invoices",
                    Count = invoiceStats.Unpaid,
                    Href = "/admin/invoices?status=Unpaid"
                });
            }

            if (invoiceStats.Overdue > 0)
            {
                attention.Add(new DashboardAttentionItem
                {
                    Key = "overdueInvoices",
                    Label = "Overdue invoices",
                    Count = invoiceStats.Overdue,
                    Href = "/admin/invoices?status=Overdue"
                });
            }
        }

        List<DashboardActivityItem> recent = [];
        if (canAudit && userId is Guid uid && organizationId is Guid)
        {
            recent = await _dbContext.AuditLogs.AsNoTracking()
                .OrderByDescending(a => a.CreatedAt)
                .Take(8)
                .Select(a => new DashboardActivityItem
                {
                    Id = a.Id,
                    ActorName = a.ActorName,
                    Action = a.Action,
                    EntityType = a.EntityType,
                    EntityLabel = a.EntityLabel,
                    Summary = a.Summary,
                    CreatedAt = a.CreatedAt
                })
                .ToListAsync(cancellationToken);
        }

        var monthlyVolumes = new List<MonthlyVolumePoint>();
        if (canOrders)
        {
            var startMonth = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc).AddMonths(-11);
            var orderRows = await _dbContext.Orders.AsNoTracking()
                .Where(o => !o.IsDeleted && o.OrderDate >= startMonth)
                .Select(o => new { o.OrderDate, o.Direction, o.TotalAmount })
                .ToListAsync(cancellationToken);

            for (var i = 0; i < 12; i++)
            {
                var month = startMonth.AddMonths(i);
                var next = month.AddMonths(1);
                var inMonth = orderRows.Where(o => o.OrderDate >= month && o.OrderDate < next).ToList();
                monthlyVolumes.Add(new MonthlyVolumePoint
                {
                    Month = month.ToString("MMM", CultureInfo.InvariantCulture),
                    PurchaseAmount = inMonth
                        .Where(o => o.Direction == OrderDirection.Purchase)
                        .Sum(o => o.TotalAmount),
                    SaleAmount = inMonth
                        .Where(o => o.Direction == OrderDirection.Sale)
                        .Sum(o => o.TotalAmount)
                });
            }
        }

        var progress = new DashboardProgressStats();
        if (canOrders && orderStats.Total > 0)
        {
            var advanced = await _dbContext.Orders.AsNoTracking()
                .CountAsync(
                    o => !o.IsDeleted &&
                         (o.Status == OrderStatus.Approved
                          || o.Status == OrderStatus.Shipped
                          || o.Status == OrderStatus.Delivered),
                    cancellationToken);
            progress.FulfilledOrderPercent = Math.Round(advanced * 100m / orderStats.Total, 0);
        }

        if (showFinanceMoney && canInvoices && invoiceStats.Total > 0)
        {
            progress.PaidInvoicePercent = Math.Round(
                invoiceStats.Paid * 100m / invoiceStats.Total, 0);
        }

        string? topVendor = null;
        string? topClient = null;
        if (canOrders)
        {
            topVendor = await _dbContext.Orders.AsNoTracking()
                .Where(o => !o.IsDeleted && o.Direction == OrderDirection.Purchase)
                .GroupBy(o => o.SupplierCompanyName)
                .OrderByDescending(g => g.Sum(x => x.TotalAmount))
                .Select(g => g.Key)
                .FirstOrDefaultAsync(cancellationToken);

            topClient = await _dbContext.Orders.AsNoTracking()
                .Where(o => !o.IsDeleted && o.Direction == OrderDirection.Sale)
                .GroupBy(o => o.BuyerCompanyName)
                .OrderByDescending(g => g.Sum(x => x.TotalAmount))
                .Select(g => g.Key)
                .FirstOrDefaultAsync(cancellationToken);
        }

        return new DashboardSummaryResponse
        {
            Orders = orderStats,
            Invoices = invoiceStats,
            Partners = partnerStats,
            ProductCount = productCount,
            Employees = employeeStats,
            Attention = attention,
            RecentActivity = recent,
            MonthlyVolumes = monthlyVolumes,
            Progress = progress,
            TopVendorName = topVendor,
            TopClientName = topClient
        };
    }

    private static async Task<MetricTrend> BuildTrendAsync<T>(
        IQueryable<T> currentQuery,
        IQueryable<T> previousQuery,
        CancellationToken cancellationToken)
    {
        var current = await currentQuery.CountAsync(cancellationToken);
        var previous = await previousQuery.CountAsync(cancellationToken);
        return BuildTrendFromCounts(current, previous);
    }

    private static MetricTrend BuildTrendFromCounts(int current, int previous)
    {
        decimal? delta = previous == 0
            ? null
            : Math.Round((decimal)(current - previous) / previous * 100m, 1);
        return new MetricTrend
        {
            CurrentPeriod = current,
            PreviousPeriod = previous,
            DeltaPercent = delta
        };
    }

    private async Task<bool> HasPageAsync(
        Guid? userId,
        Guid? organizationId,
        string pageKey,
        CancellationToken cancellationToken)
    {
        if (_tenant.IsOrgAdmin)
            return true;

        if (userId is not Guid uid || organizationId is not Guid orgId)
            return false;

        return await _permissions.HasAccessAsync(
            uid,
            orgId,
            pageKey,
            PageAccessLevel.View,
            cancellationToken);
    }
}
