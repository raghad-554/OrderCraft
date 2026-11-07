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
        var orders = _dbContext.Orders.AsNoTracking().Where(o => !o.IsDeleted);
        var invoices = _dbContext.Invoices.AsNoTracking().Where(i => !i.IsDeleted);
        var companies = _dbContext.Companies.AsNoTracking().Where(c => !c.IsDeleted);
        var products = _dbContext.Products.AsNoTracking().Where(p => !p.IsDeleted);
        var users = _dbContext.Users.AsNoTracking().Where(u => !u.IsDeleted);

        var orderStats = new OrderDashboardStats
        {
            Total = await orders.CountAsync(cancellationToken),
            Draft = await orders.CountAsync(o => o.Status == OrderStatus.Draft, cancellationToken),
            Pending = await orders.CountAsync(o => o.Status == OrderStatus.Pending, cancellationToken),
            Approved = await orders.CountAsync(o => o.Status == OrderStatus.Approved, cancellationToken),
        };

        var invoiceRows = await invoices
            .Include(i => i.Payments)
            .ToListAsync(cancellationToken);
        var invoiceStatuses = invoiceRows.Select(invoice => InvoiceMoney.Status(invoice)).ToList();
        var invoiceStats = new InvoiceDashboardStats
        {
            Total = invoiceRows.Count,
            Unpaid = invoiceStatuses.Count(s => s == InvoiceStatus.Unpaid),
            PartiallyPaid = invoiceStatuses.Count(s => s == InvoiceStatus.PartiallyPaid),
            Paid = invoiceStatuses.Count(s => s == InvoiceStatus.Paid),
            Overdue = invoiceStatuses.Count(s => s == InvoiceStatus.Overdue),
            OutstandingAmount = invoiceRows.Sum(InvoiceMoney.Outstanding),
        };

        var partnerStats = new PartnerDashboardStats
        {
            Clients = await companies.CountAsync(
                c => c.Type == CompanyType.Buyer || c.Type == CompanyType.Both,
                cancellationToken),
            Vendors = await companies.CountAsync(
                c => c.Type == CompanyType.Supplier || c.Type == CompanyType.Both,
                cancellationToken),
        };

        var employeeStats = new EmployeeDashboardStats
        {
            Total = await users.CountAsync(cancellationToken),
            Active = await users.CountAsync(u => u.IsActive, cancellationToken),
        };

        var productCount = await products.CountAsync(cancellationToken);

        var attention = new List<DashboardAttentionItem>();
        if (orderStats.Pending > 0)
        {
            attention.Add(new DashboardAttentionItem
            {
                Key = "pendingOrders",
                Label = "Purchase orders waiting for approval",
                Count = orderStats.Pending,
                Href = "/admin/purchase-orders"
            });
        }

        if (orderStats.Draft > 0)
        {
            attention.Add(new DashboardAttentionItem
            {
                Key = "draftOrders",
                Label = "Draft purchase orders",
                Count = orderStats.Draft,
                Href = "/admin/purchase-orders"
            });
        }

        var openInvoices = invoiceStats.Unpaid + invoiceStats.PartiallyPaid + invoiceStats.Overdue;
        if (openInvoices > 0)
        {
            attention.Add(new DashboardAttentionItem
            {
                Key = "openInvoices",
                Label = "Invoices still open",
                Count = openInvoices,
                Href = "/admin/invoices"
            });
        }

        if (invoiceStats.Overdue > 0)
        {
            attention.Add(new DashboardAttentionItem
            {
                Key = "overdueInvoices",
                Label = "Overdue invoices",
                Count = invoiceStats.Overdue,
                Href = "/admin/invoices"
            });
        }

        List<DashboardActivityItem> recent = [];
        if (_tenant.UserId is Guid userId
            && _tenant.OrganizationId is Guid organizationId
            && await _permissions.HasAccessAsync(
                userId,
                organizationId,
                "auditLog",
                PageAccessLevel.View,
                cancellationToken))
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

        return new DashboardSummaryResponse
        {
            Orders = orderStats,
            Invoices = invoiceStats,
            Partners = partnerStats,
            ProductCount = productCount,
            Employees = employeeStats,
            Attention = attention,
            RecentActivity = recent
        };
    }
}
