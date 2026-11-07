using Microsoft.EntityFrameworkCore;
using OrderCraft.Models;

namespace OrderCraft.Services;

public class ApplicationDbContext : DbContext
{
    private readonly ITenantContext _tenant;

    public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options, ITenantContext tenant)
        : base(options)
    {
        _tenant = tenant;
    }

    public DbSet<User> Users => Set<User>();
    public DbSet<Organization> Organizations => Set<Organization>();
    public DbSet<OrganizationMembership> OrganizationMemberships => Set<OrganizationMembership>();
    public DbSet<OrganizationRole> OrganizationRoles => Set<OrganizationRole>();
    public DbSet<OrganizationDepartment> OrganizationDepartments => Set<OrganizationDepartment>();
    public DbSet<OrganizationDepartmentPermission> OrganizationDepartmentPermissions =>
        Set<OrganizationDepartmentPermission>();
    public DbSet<Company> Companies => Set<Company>();
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<Product> Products => Set<Product>();
    public DbSet<Order> Orders => Set<Order>();
    public DbSet<OrderItem> OrderItems => Set<OrderItem>();
    public DbSet<OrderFieldChange> OrderFieldChanges => Set<OrderFieldChange>();
    public DbSet<Invoice> Invoices => Set<Invoice>();
    public DbSet<Payment> Payments => Set<Payment>();
    public DbSet<UserPagePermission> UserPagePermissions => Set<UserPagePermission>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        ConfigureUser(modelBuilder);
        ConfigureOrganization(modelBuilder);
        ConfigureOrganizationMembership(modelBuilder);
        ConfigureOrganizationRole(modelBuilder);
        ConfigureOrganizationDepartment(modelBuilder);
        ConfigureOrganizationDepartmentPermission(modelBuilder);
        ConfigureUserPagePermission(modelBuilder);
        ConfigureCategory(modelBuilder);
        ConfigureCompany(modelBuilder);
        ConfigureProduct(modelBuilder);
        ConfigureOrder(modelBuilder);
        ConfigureOrderItem(modelBuilder);
        ConfigureOrderFieldChange(modelBuilder);
        ConfigureInvoice(modelBuilder);
        ConfigurePayment(modelBuilder);
        ConfigureAuditLog(modelBuilder);
    }

    // Evaluated per query so tenant middleware can set the org after construction.
    private Guid TenantId => _tenant.OrganizationId ?? Guid.Empty;

    private void ConfigureOrganization(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Organization>(entity =>
        {
            entity.ToTable("Organizations");
            entity.HasKey(o => o.Id);
            entity.Property(o => o.Name).IsRequired().HasMaxLength(200);
            entity.Property(o => o.Slug).IsRequired().HasMaxLength(80);
            entity.HasIndex(o => o.Slug).IsUnique();
            entity.Property(o => o.IsActive).IsRequired().HasDefaultValue(true);
            entity.Property(o => o.ContactEmail).HasMaxLength(256);
            entity.Property(o => o.ContactPhone).HasMaxLength(20);
            entity.Property(o => o.EnabledPageKeys).IsRequired().HasMaxLength(2000).HasDefaultValue("");
            entity.Property(o => o.ApprovalThreshold)
                .IsRequired()
                .HasColumnType("numeric(18,2)")
                .HasDefaultValue(0m);
            entity.Property(o => o.CreatedAt).IsRequired().HasDefaultValueSql("CURRENT_TIMESTAMP");
        });
    }

    private static void ConfigureOrganizationMembership(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<OrganizationMembership>(entity =>
        {
            entity.ToTable("OrganizationMemberships");
            entity.HasKey(m => m.Id);
            entity.HasIndex(m => new { m.OrganizationId, m.UserId }).IsUnique();
            entity.Property(m => m.Role).IsRequired().HasConversion<string>().HasMaxLength(50);
            entity.Property(m => m.Status).IsRequired().HasConversion<string>().HasMaxLength(20);
            entity.Property(m => m.PasswordHash).IsRequired().HasMaxLength(512);
            entity.Property(m => m.CreatedAt).IsRequired().HasDefaultValueSql("CURRENT_TIMESTAMP");
            entity.HasOne(m => m.Organization)
                .WithMany(o => o.Memberships)
                .HasForeignKey(m => m.OrganizationId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(m => m.User)
                .WithMany(u => u.Memberships)
                .HasForeignKey(m => m.UserId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(m => m.OrganizationRole)
                .WithMany(r => r.Memberships)
                .HasForeignKey(m => m.OrganizationRoleId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(m => m.OrganizationDepartment)
                .WithMany(d => d.Memberships)
                .HasForeignKey(m => m.OrganizationDepartmentId)
                .OnDelete(DeleteBehavior.SetNull);
        });
    }

    private void ConfigureOrganizationRole(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<OrganizationRole>(entity =>
        {
            entity.ToTable("OrganizationRoles");
            entity.HasKey(r => r.Id);
            entity.Property(r => r.Key).IsRequired().HasMaxLength(80);
            entity.Property(r => r.Name).IsRequired().HasMaxLength(80);
            entity.Property(r => r.Template).IsRequired().HasConversion<string>().HasMaxLength(50);
            entity.Property(r => r.IsSystem).IsRequired().HasDefaultValue(false);
            entity.Property(r => r.IsActive).IsRequired().HasDefaultValue(true);
            entity.Property(r => r.CreatedAt).IsRequired().HasDefaultValueSql("CURRENT_TIMESTAMP");
            entity.HasIndex(r => new { r.OrganizationId, r.Key }).IsUnique();
            entity.HasIndex(r => new { r.OrganizationId, r.Name }).IsUnique();
            entity.HasOne(r => r.Organization)
                .WithMany(o => o.Roles)
                .HasForeignKey(r => r.OrganizationId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }

    private void ConfigureOrganizationDepartment(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<OrganizationDepartment>(entity =>
        {
            entity.ToTable("OrganizationDepartments");
            entity.HasKey(d => d.Id);
            entity.Property(d => d.Name).IsRequired().HasMaxLength(100);
            entity.Property(d => d.IsActive).IsRequired().HasDefaultValue(true);
            entity.Property(d => d.CreatedAt).IsRequired().HasDefaultValueSql("CURRENT_TIMESTAMP");
            entity.HasIndex(d => new { d.OrganizationId, d.Name }).IsUnique();
            entity.HasOne(d => d.Organization)
                .WithMany(o => o.Departments)
                .HasForeignKey(d => d.OrganizationId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }

    private static void ConfigureOrganizationDepartmentPermission(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<OrganizationDepartmentPermission>(entity =>
        {
            entity.ToTable("OrganizationDepartmentPermissions");
            entity.HasKey(p => p.Id);
            entity.Property(p => p.Id).ValueGeneratedOnAdd();
            entity.Property(p => p.PageKey).IsRequired().HasMaxLength(50);
            entity.Property(p => p.AccessLevel).IsRequired().HasConversion<string>().HasMaxLength(20);
            entity.HasIndex(p => new { p.DepartmentId, p.PageKey }).IsUnique();
            entity.HasOne(p => p.Department)
                .WithMany(d => d.Permissions)
                .HasForeignKey(p => p.DepartmentId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }

    private void ConfigureCategory(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Category>(entity =>
        {
            entity.ToTable("Categories");

            entity.HasKey(c => c.Id);

            entity.Property(c => c.Name)
                .IsRequired()
                .HasMaxLength(100);

            entity.HasIndex(c => new { c.OrganizationId, c.Name })
                .IsUnique()
                .HasFilter("\"IsDeleted\" = false");

            entity.HasOne(c => c.Organization)
                .WithMany()
                .HasForeignKey(c => c.OrganizationId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.Property(c => c.Description)
                .HasMaxLength(250);

            entity.Property(c => c.IsDeleted)
                .IsRequired()
                .HasDefaultValue(false);

            entity.Property(c => c.DeletedAt);

            entity.HasQueryFilter(c => !c.IsDeleted && c.OrganizationId == TenantId);
        });
    }

    private static void ConfigureUser(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<User>(entity =>
        {
            entity.ToTable("Users");

            entity.HasKey(u => u.Id);

            entity.Property(u => u.Username)
                .IsRequired()
                .HasMaxLength(50);

            entity.HasIndex(u => u.Username)
                .IsUnique();

            entity.Property(u => u.FullName)
                .IsRequired()
                .HasMaxLength(200);

            entity.Property(u => u.Email)
                .IsRequired()
                .HasMaxLength(256);

            entity.HasIndex(u => u.Email)
                .IsUnique();

            entity.Property(u => u.PasswordHash)
                .IsRequired()
                .HasMaxLength(512);

            entity.Property(u => u.Role)
                .IsRequired()
                .HasConversion<string>()
                .HasMaxLength(50);

            entity.Property(u => u.PhoneNumber)
                .IsRequired()
                .HasMaxLength(20);

            entity.Property(u => u.Department)
                .HasMaxLength(100);

            entity.Property(u => u.IsPlatformAdmin)
                .IsRequired()
                .HasDefaultValue(false);

            entity.Property(u => u.IsActive)
                .IsRequired()
                .HasDefaultValue(true);

            entity.Property(u => u.LastLoginAt);

            entity.Property(u => u.CreatedAt)
                .IsRequired()
                .HasDefaultValueSql("CURRENT_TIMESTAMP");

            entity.Property(u => u.IsDeleted)
                .IsRequired()
                .HasDefaultValue(false);

            entity.Property(u => u.DeletedAt);

            entity.HasQueryFilter(u => !u.IsDeleted);

            entity.HasOne(u => u.Company)
                .WithMany(c => c.Users)
                .HasForeignKey(u => u.CompanyId)
                .OnDelete(DeleteBehavior.SetNull);
        });
    }

    private static void ConfigureUserPagePermission(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<UserPagePermission>(entity =>
        {
            entity.ToTable("UserPagePermissions");

            entity.HasKey(p => p.Id);

            entity.Property(p => p.PageKey)
                .IsRequired()
                .HasMaxLength(50);

            entity.Property(p => p.AccessLevel)
                .IsRequired()
                .HasConversion<string>()
                .HasMaxLength(20);

            entity.HasIndex(p => new { p.MembershipId, p.PageKey })
                .IsUnique();

            entity.HasOne(p => p.Membership)
                .WithMany(m => m.PagePermissions)
                .HasForeignKey(p => p.MembershipId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }

    private void ConfigureCompany(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Company>(entity =>
        {
            entity.ToTable("Companies");

            entity.HasKey(c => c.Id);

            entity.Property(c => c.Name)
                .IsRequired()
                .HasMaxLength(200);

            entity.Property(c => c.Email)
                .IsRequired()
                .HasMaxLength(256);

            entity.HasIndex(c => new { c.OrganizationId, c.Email })
                .IsUnique()
                .HasFilter("\"IsDeleted\" = false");

            entity.HasOne(c => c.Organization)
                .WithMany()
                .HasForeignKey(c => c.OrganizationId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.Property(c => c.Phone)
                .HasMaxLength(20);

            entity.Property(c => c.Address)
                .HasMaxLength(500);

            entity.Property(c => c.TaxNumber)
                .HasMaxLength(50);

            entity.Property(c => c.Type)
                .IsRequired()
                .HasConversion<string>()
                .HasMaxLength(20);

            entity.Property(c => c.CreditLimit)
                .HasColumnType("numeric(18,2)");

            entity.Property(c => c.PaymentTerm)
                .HasMaxLength(50);

            entity.Property(c => c.DiscountRate)
                .HasColumnType("numeric(5,2)");

            entity.Property(c => c.OrderCount)
                .IsRequired()
                .HasDefaultValue(0);

            entity.Property(c => c.TotalSpend)
                .IsRequired()
                .HasColumnType("numeric(18,2)")
                .HasDefaultValue(0m);

            entity.Property(c => c.TotalSales)
                .IsRequired()
                .HasColumnType("numeric(18,2)")
                .HasDefaultValue(0m);

            entity.Property(c => c.OutstandingBalance)
                .IsRequired()
                .HasColumnType("numeric(18,2)")
                .HasDefaultValue(0m);

            entity.Property(c => c.PerformanceScore)
                .HasColumnType("numeric(3,1)");

            entity.Property(c => c.Status)
                .IsRequired()
                .HasConversion<string>()
                .HasMaxLength(20)
                .HasDefaultValue(CompanyStatus.Active);

            entity.Property(c => c.CreatedAt)
                .IsRequired()
                .HasDefaultValueSql("CURRENT_TIMESTAMP");

            entity.Property(c => c.IsDeleted)
                .IsRequired()
                .HasDefaultValue(false);

            entity.Property(c => c.DeletedAt);

            entity.HasOne(c => c.Category)
                .WithMany(cat => cat.Companies)
                .HasForeignKey(c => c.CategoryId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasQueryFilter(c => !c.IsDeleted && c.OrganizationId == TenantId);
        });
    }

    private void ConfigureProduct(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Product>(entity =>
        {
            entity.ToTable("Products");

            entity.HasKey(p => p.Id);

            entity.Property(p => p.Name)
                .IsRequired()
                .HasMaxLength(200);

            entity.Property(p => p.Description)
                .HasMaxLength(1000);

            entity.Property(p => p.SKU)
                .IsRequired()
                .HasMaxLength(50);

            entity.HasIndex(p => new { p.OrganizationId, p.CompanyId, p.SKU })
                .IsUnique()
                .HasFilter("\"IsDeleted\" = false");

            entity.HasOne(p => p.Organization)
                .WithMany()
                .HasForeignKey(p => p.OrganizationId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.Property(p => p.Price)
                .IsRequired()
                .HasColumnType("numeric(18,2)");

            entity.Property(p => p.StockQuantity)
                .IsRequired();

            entity.Property(p => p.IsActive)
                .IsRequired()
                .HasDefaultValue(true);

            entity.Property(p => p.IsDeleted)
                .IsRequired()
                .HasDefaultValue(false);

            entity.Property(p => p.DeletedAt);

            entity.HasQueryFilter(p => !p.IsDeleted && p.OrganizationId == TenantId);

            entity.HasOne(p => p.Company)
                .WithMany(c => c.Products)
                .HasForeignKey(p => p.CompanyId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(p => p.Category)
                .WithMany(c => c.Products)
                .HasForeignKey(p => p.CategoryId)
                .OnDelete(DeleteBehavior.SetNull);
        });
    }

    private void ConfigureOrder(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Order>(entity =>
        {
            entity.ToTable("Orders");

            entity.HasKey(o => o.Id);

            entity.Property(o => o.OrderNumber)
                .IsRequired()
                .HasMaxLength(50);

            entity.HasIndex(o => new { o.OrganizationId, o.OrderNumber })
                .IsUnique()
                .HasFilter("\"IsDeleted\" = false");

            entity.HasOne(o => o.Organization)
                .WithMany()
                .HasForeignKey(o => o.OrganizationId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.Property(o => o.Direction)
                .IsRequired()
                .HasConversion<string>()
                .HasMaxLength(20)
                .HasDefaultValue(OrderDirection.Purchase);

            entity.Property(o => o.Status)
                .IsRequired()
                .HasConversion<string>()
                .HasMaxLength(20);

            entity.Property(o => o.TotalAmount)
                .IsRequired()
                .HasColumnType("numeric(18,2)");

            entity.Property(o => o.OrderDate)
                .IsRequired()
                .HasDefaultValueSql("CURRENT_TIMESTAMP");

            entity.Property(o => o.DeliveryDate);

            entity.Property(o => o.PaymentTerms)
                .HasConversion<string>()
                .HasMaxLength(20);

            entity.Property(o => o.TaxRate)
                .IsRequired()
                .HasColumnType("numeric(5,2)")
                .HasDefaultValue(0m);

            entity.Property(o => o.Notes)
                .HasMaxLength(1000);

            entity.Property(o => o.RejectionReason)
                .HasMaxLength(1000);

            entity.Property(o => o.IsDeleted)
                .IsRequired()
                .HasDefaultValue(false);

            entity.Property(o => o.DeletedAt);

            entity.HasQueryFilter(o => !o.IsDeleted && o.OrganizationId == TenantId);

            entity.Property(o => o.BuyerCompanyName)
                .IsRequired()
                .HasMaxLength(200);

            entity.Property(o => o.SupplierCompanyName)
                .IsRequired()
                .HasMaxLength(200);

            entity.HasOne(o => o.BuyerCompany)
                .WithMany(c => c.BuyerOrders)
                .HasForeignKey(o => o.BuyerCompanyId)
                .IsRequired(false)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(o => o.SupplierCompany)
                .WithMany(c => c.SupplierOrders)
                .HasForeignKey(o => o.SupplierCompanyId)
                .IsRequired(false)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(o => o.CreatedByUser)
                .WithMany(u => u.CreatedOrders)
                .HasForeignKey(o => o.CreatedByUserId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasMany(o => o.Invoices)
                .WithOne(i => i.Order)
                .HasForeignKey(i => i.OrderId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }

    private static void ConfigureOrderItem(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<OrderItem>(entity =>
        {
            entity.ToTable("OrderItems");

            entity.HasKey(oi => oi.Id);

            entity.Property(oi => oi.Quantity)
                .IsRequired();

            entity.Property(oi => oi.UnitPrice)
                .IsRequired()
                .HasColumnType("numeric(18,2)");

            entity.Property(oi => oi.DiscountAmount)
                .IsRequired()
                .HasColumnType("numeric(18,2)")
                .HasDefaultValue(0m);

            entity.Property(oi => oi.TotalPrice)
                .IsRequired()
                .HasColumnType("numeric(18,2)");

            entity.HasOne(oi => oi.Order)
                .WithMany(o => o.OrderItems)
                .HasForeignKey(oi => oi.OrderId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(oi => oi.Product)
                .WithMany(p => p.OrderItems)
                .HasForeignKey(oi => oi.ProductId)
                .OnDelete(DeleteBehavior.Restrict);
        });
    }

    private void ConfigureOrderFieldChange(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<OrderFieldChange>(entity =>
        {
            entity.ToTable("OrderFieldChanges");
            entity.HasKey(c => c.Id);
            entity.Property(c => c.ActorName).IsRequired().HasMaxLength(100);
            entity.Property(c => c.Field).IsRequired().HasMaxLength(200);
            entity.Property(c => c.OldValue).HasMaxLength(1000);
            entity.Property(c => c.NewValue).HasMaxLength(1000);
            entity.Property(c => c.CreatedAt).IsRequired().HasDefaultValueSql("CURRENT_TIMESTAMP");
            entity.HasIndex(c => new { c.OrderId, c.CreatedAt });
            entity.HasOne(c => c.Order)
                .WithMany()
                .HasForeignKey(c => c.OrderId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(c => c.Organization)
                .WithMany()
                .HasForeignKey(c => c.OrganizationId)
                .OnDelete(DeleteBehavior.SetNull);
            entity.HasQueryFilter(c => c.OrganizationId == TenantId);
        });
    }

    private void ConfigureInvoice(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Invoice>(entity =>
        {
            entity.ToTable("Invoices");

            entity.HasKey(i => i.Id);

            entity.Property(i => i.InvoiceNumber)
                .IsRequired()
                .HasMaxLength(50);

            entity.HasIndex(i => new { i.OrganizationId, i.InvoiceNumber })
                .IsUnique()
                .HasFilter("\"IsDeleted\" = false");

            entity.HasOne(i => i.Organization)
                .WithMany()
                .HasForeignKey(i => i.OrganizationId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(i => i.OrderId);

            entity.Property(i => i.Currency)
                .IsRequired()
                .HasMaxLength(3)
                .HasDefaultValue("USD");

            entity.Property(i => i.Amount)
                .IsRequired()
                .HasColumnType("numeric(18,2)");

            entity.Property(i => i.Status)
                .IsRequired()
                .HasConversion<string>()
                .HasMaxLength(20);

            entity.Property(i => i.DueDate)
                .IsRequired();

            entity.Property(i => i.IsDeleted)
                .IsRequired()
                .HasDefaultValue(false);

            entity.Property(i => i.DeletedAt);

            entity.HasQueryFilter(i => !i.IsDeleted && i.OrganizationId == TenantId);
        });
    }

    private void ConfigurePayment(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Payment>(entity =>
        {
            entity.ToTable("Payments");
            entity.HasKey(p => p.Id);
            entity.Property(p => p.Amount).IsRequired().HasColumnType("numeric(18,2)");
            entity.Property(p => p.RecordedByName).IsRequired().HasMaxLength(100);
            entity.Property(p => p.PaidAt).IsRequired().HasDefaultValueSql("CURRENT_TIMESTAMP");
            entity.HasIndex(p => p.InvoiceId);
            entity.HasOne(p => p.Invoice)
                .WithMany(i => i.Payments)
                .HasForeignKey(p => p.InvoiceId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(p => p.Organization)
                .WithMany()
                .HasForeignKey(p => p.OrganizationId)
                .OnDelete(DeleteBehavior.SetNull);
            entity.HasQueryFilter(p => p.OrganizationId == TenantId);
        });
    }

    private void ConfigureAuditLog(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<AuditLog>(entity =>
        {
            entity.ToTable("AuditLogs");

            entity.HasKey(a => a.Id);

            entity.Property(a => a.ActorName)
                .IsRequired()
                .HasMaxLength(100);

            entity.Property(a => a.Action)
                .IsRequired()
                .HasMaxLength(50);

            entity.Property(a => a.EntityType)
                .IsRequired()
                .HasMaxLength(50);

            entity.Property(a => a.EntityId)
                .HasMaxLength(100);

            entity.Property(a => a.EntityLabel)
                .HasMaxLength(200);

            entity.Property(a => a.Summary)
                .HasMaxLength(1000);

            entity.Property(a => a.CreatedAt)
                .IsRequired()
                .HasDefaultValueSql("CURRENT_TIMESTAMP");

            entity.HasIndex(a => a.CreatedAt);
            entity.HasIndex(a => a.EntityType);
            entity.HasIndex(a => a.Action);

            entity.HasOne(a => a.Organization)
                .WithMany()
                .HasForeignKey(a => a.OrganizationId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasQueryFilter(a => a.OrganizationId == TenantId);
        });
    }
}
