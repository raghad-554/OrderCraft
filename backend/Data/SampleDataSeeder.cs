using Microsoft.EntityFrameworkCore;
using OrderCraft.Models;

namespace OrderCraft.Services;

public static class SampleDataSeeder
{
    private const string DemoPassword = "Demo@123";
    private const string DemoMarker = "[demo]";

    public static async Task SeedAsync(IServiceProvider services)
    {
        using var scope = services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var passwords = scope.ServiceProvider.GetRequiredService<IPasswordService>();

        await db.Database.MigrateAsync();
        await BackfillMembershipPasswordsAsync(db);

        var catalog = scope.ServiceProvider.GetRequiredService<IOrgCatalogService>();
        var admin = await EnsureAdminAsync(db, passwords);
        var employees = await EnsureDemoEmployeesAsync(db, passwords);
        await EnsurePlatformAdminAsync(db, passwords);
        var org = await EnsureDefaultOrganizationAsync(db, admin, catalog);
        await EnsureDemoAuditLogsAsync(db, admin, employees, org.Id);
        await EnsureOrderCraftOpsDemoAsync(db, admin, employees, org.Id);
        await EnsureTestTenantsAsync(db, passwords, catalog);
        await AlignDemoPasswordHashesAsync(db, passwords);
    }

    /// <summary>
    /// Ensures demo accounts verify against the plain password (backend Identity hash only).
    /// Migrates away from any temporary client-transport hashes.
    /// </summary>
    private static async Task AlignDemoPasswordHashesAsync(
        ApplicationDbContext db,
        IPasswordService passwords)
    {
        var accounts = new (string Username, string Plain)[]
        {
            ("admin", "Admin@123"),
            ("platform.admin", "Admin@123"),
            ("sara.procurement", DemoPassword),
            ("omar.finance", DemoPassword),
            ("layla.buyer", DemoPassword),
            ("gulf.admin", DemoPassword),
            ("nile.admin", DemoPassword),
        };

        foreach (var (username, plain) in accounts)
        {
            var user = await db.Users.FirstOrDefaultAsync(u =>
                !u.IsDeleted && u.Username.ToLower() == username);
            if (user is null)
                continue;

            if (passwords.VerifyPassword(user.PasswordHash, plain))
                continue;

            var nextHash = passwords.HashPassword(plain);
            user.PasswordHash = nextHash;

            var memberships = await db.OrganizationMemberships
                .Where(m => m.UserId == user.Id)
                .ToListAsync();
            foreach (var membership in memberships)
                membership.PasswordHash = nextHash;
        }

        if (db.ChangeTracker.HasChanges())
            await db.SaveChangesAsync();
    }

    private static async Task BackfillMembershipPasswordsAsync(ApplicationDbContext db)
    {
        var rows = await db.OrganizationMemberships
            .Include(m => m.User)
            .Where(m => m.PasswordHash == "")
            .ToListAsync();
        foreach (var membership in rows)
        {
            if (membership.User is null || string.IsNullOrWhiteSpace(membership.User.PasswordHash))
                continue;
            membership.PasswordHash = membership.User.PasswordHash;
        }

        if (db.ChangeTracker.HasChanges())
            await db.SaveChangesAsync();
    }

    private static async Task<Organization> EnsureDefaultOrganizationAsync(
        ApplicationDbContext db,
        User admin,
        IOrgCatalogService catalog)
    {
        var org = await db.Organizations.FirstOrDefaultAsync(o => o.Slug == "ordercraft");
        if (org is null)
        {
            org = new Organization
            {
                Name = "OrderCraft",
                Slug = "ordercraft",
                IsActive = true,
                EnabledPageKeys = AppPages.SerializeEnabledKeys(AppPages.DefaultEnabledKeys),
                CreatedAt = DateTime.UtcNow.AddDays(-30)
            };
            db.Organizations.Add(org);
            await db.SaveChangesAsync();
        }
        else if (string.IsNullOrWhiteSpace(org.EnabledPageKeys))
        {
            org.EnabledPageKeys = AppPages.SerializeEnabledKeys(AppPages.DefaultEnabledKeys);
        }

        await catalog.EnsureDefaultsAsync(org.Id);

        var orderCraftUsernames = new[]
        {
            "admin", "sara.procurement", "omar.finance", "layla.buyer"
        };
        var users = await db.Users.IgnoreQueryFilters()
            .Where(u => !u.IsDeleted && orderCraftUsernames.Contains(u.Username.ToLower()))
            .ToListAsync();
        foreach (var user in users)
        {
            await EnsureMembershipAsync(db, catalog, org, user, user.Role, user.Department);
        }

        await db.Companies.IgnoreQueryFilters()
            .Where(c => c.OrganizationId == Guid.Empty)
            .ExecuteUpdateAsync(s => s.SetProperty(c => c.OrganizationId, org.Id));
        await db.Products.IgnoreQueryFilters()
            .Where(p => p.OrganizationId == Guid.Empty)
            .ExecuteUpdateAsync(s => s.SetProperty(p => p.OrganizationId, org.Id));
        await db.Categories.IgnoreQueryFilters()
            .Where(c => c.OrganizationId == Guid.Empty)
            .ExecuteUpdateAsync(s => s.SetProperty(c => c.OrganizationId, org.Id));
        await db.Orders.IgnoreQueryFilters()
            .Where(o => o.OrganizationId == Guid.Empty)
            .ExecuteUpdateAsync(s => s.SetProperty(o => o.OrganizationId, org.Id));
        await db.Invoices.IgnoreQueryFilters()
            .Where(i => i.OrganizationId == Guid.Empty)
            .ExecuteUpdateAsync(s => s.SetProperty(i => i.OrganizationId, org.Id));
        await db.AuditLogs.IgnoreQueryFilters()
            .Where(a => a.OrganizationId == null)
            .ExecuteUpdateAsync(s => s.SetProperty(a => a.OrganizationId, org.Id));

        if (db.ChangeTracker.HasChanges())
            await db.SaveChangesAsync();

        return org;
    }

    private static async Task<User> EnsureAdminAsync(ApplicationDbContext db, IPasswordService passwords)
    {
        var admin = await db.Users.FirstOrDefaultAsync(u =>
            !u.IsDeleted && u.Username.ToLower() == "admin");

        if (admin is not null)
            return admin;

        admin = new User
        {
            Username = "admin",
            FullName = "System Admin User Account",
            Email = "admin@ordercraft.local",
            PasswordHash = passwords.HashPassword("Admin@123"),
            Role = UserRole.Admin,
            PhoneNumber = "+10000000000",
            Department = "Administration",
            IsActive = true,
            CreatedAt = DateTime.UtcNow.AddDays(-30),
            LastLoginAt = DateTime.UtcNow.AddHours(-2)
        };

        db.Users.Add(admin);
        await db.SaveChangesAsync();
        return admin;
    }

    private static async Task<IReadOnlyList<User>> EnsureDemoEmployeesAsync(
        ApplicationDbContext db,
        IPasswordService passwords)
    {
        var specs = new (string Username, string FullName, string Email, UserRole Role, string Dept, string Phone)[]
        {
            ("sara.procurement", "Sara Ahmed Khalid Nasser", "sara.procurement@ordercraft.local", UserRole.ProcurementManager, "Procurement", "+15551001001"),
            ("omar.finance", "Omar Hassan Ali Farouk", "omar.finance@ordercraft.local", UserRole.Finance, "Finance", "+15551001002"),
            ("layla.buyer", "Layla Noor Samir Qasim", "layla.buyer@ordercraft.local", UserRole.ProcurementManager, "Procurement", "+15551001003"),
        };

        var created = new List<User>();

        foreach (var spec in specs)
        {
            var existing = await db.Users.FirstOrDefaultAsync(u =>
                !u.IsDeleted && u.Username.ToLower() == spec.Username);

            if (existing is not null)
            {
                if (existing.Role != spec.Role || existing.Department != spec.Dept)
                {
                    existing.Role = spec.Role;
                    existing.Department = spec.Dept;
                }
                created.Add(existing);
                continue;
            }

            var user = new User
            {
                Username = spec.Username,
                FullName = spec.FullName,
                Email = spec.Email,
                PasswordHash = passwords.HashPassword(DemoPassword),
                Role = spec.Role,
                PhoneNumber = spec.Phone,
                Department = spec.Dept,
                IsActive = true,
                CreatedAt = DateTime.UtcNow.AddDays(-14),
                LastLoginAt = DateTime.UtcNow.AddDays(-1)
            };

            db.Users.Add(user);
            created.Add(user);
        }

        if (db.ChangeTracker.HasChanges())
            await db.SaveChangesAsync();

        return created;
    }

    private static async Task EnsureDemoAuditLogsAsync(
        ApplicationDbContext db,
        User admin,
        IReadOnlyList<User> employees,
        Guid organizationId)
    {
        if (await db.AuditLogs.IgnoreQueryFilters().AnyAsync(a => a.Summary != null && a.Summary.StartsWith(DemoMarker)))
            return;

        var sara = employees.FirstOrDefault(e => e.Username == "sara.procurement");
        var omar = employees.FirstOrDefault(e => e.Username == "omar.finance");
        var layla = employees.FirstOrDefault(e => e.Username == "layla.buyer");

        if (sara is null || omar is null || layla is null)
            return;

        var now = DateTime.UtcNow;
        var logs = new List<AuditLog>
        {
            Log(organizationId, admin, "Login", "Auth", null, null, $"{DemoMarker} Admin signed in.", now.AddDays(-5).AddHours(1)),
            Log(organizationId, admin, "Created", "Employee", sara.Id.ToString(), sara.FullName, $"{DemoMarker} Created employee account for {sara.FullName}.", now.AddDays(-5).AddHours(2)),
            Log(organizationId, admin, "Created", "Employee", omar.Id.ToString(), omar.FullName, $"{DemoMarker} Created employee account for {omar.FullName}.", now.AddDays(-5).AddHours(2).AddMinutes(10)),
            Log(organizationId, admin, "Created", "Employee", layla.Id.ToString(), layla.FullName, $"{DemoMarker} Created employee account for {layla.FullName}.", now.AddDays(-5).AddHours(2).AddMinutes(20)),
            Log(organizationId, admin, "PermissionsUpdated", "Employee", sara.Id.ToString(), sara.FullName, $"{DemoMarker} Updated page access for {sara.FullName}.", now.AddDays(-4).AddHours(3)),

            Log(organizationId, sara, "Login", "Auth", null, null, $"{DemoMarker} Sara signed in.", now.AddDays(-4).AddHours(8)),
            Log(organizationId, sara, "Created", "Company", Guid.NewGuid().ToString(), "Gulf Supply Co.", $"{DemoMarker} Added vendor Gulf Supply Co.", now.AddDays(-4).AddHours(9)),
            Log(organizationId, sara, "Created", "Product", Guid.NewGuid().ToString(), "Industrial Gloves XL", $"{DemoMarker} Added product Industrial Gloves XL.", now.AddDays(-4).AddHours(10)),
            Log(organizationId, sara, "Created", "Order", Guid.NewGuid().ToString(), "PO-10021", $"{DemoMarker} Created draft purchase order PO-10021.", now.AddDays(-3).AddHours(11)),
            Log(organizationId, sara, "Updated", "Order", Guid.NewGuid().ToString(), "PO-10021", $"{DemoMarker} Submitted purchase order PO-10021 for approval.", now.AddDays(-3).AddHours(12)),
            Log(organizationId, sara, "StatusChanged", "Order", Guid.NewGuid().ToString(), "PO-10021", $"{DemoMarker} Marked PO-10021 as Approved.", now.AddDays(-2).AddHours(14)),

            Log(organizationId, omar, "Login", "Auth", null, null, $"{DemoMarker} Omar signed in.", now.AddDays(-3).AddHours(9)),
            Log(organizationId, omar, "Created", "Invoice", Guid.NewGuid().ToString(), "INV-2044", $"{DemoMarker} Generated invoice INV-2044 from PO-10021.", now.AddDays(-2).AddHours(15)),
            Log(organizationId, omar, "Updated", "Invoice", Guid.NewGuid().ToString(), "INV-2044", $"{DemoMarker} Recorded partial payment on INV-2044.", now.AddDays(-1).AddHours(10)),
            Log(organizationId, omar, "Updated", "Invoice", Guid.NewGuid().ToString(), "INV-2044", $"{DemoMarker} Marked INV-2044 as Paid.", now.AddHours(-6)),

            Log(organizationId, layla, "Login", "Auth", null, null, $"{DemoMarker} Layla signed in.", now.AddDays(-2).AddHours(8)),
            Log(organizationId, layla, "Created", "Order", Guid.NewGuid().ToString(), "PO-10035", $"{DemoMarker} Created purchase order PO-10035.", now.AddDays(-2).AddHours(10)),
            Log(organizationId, layla, "Updated", "Product", Guid.NewGuid().ToString(), "Safety Helmets", $"{DemoMarker} Updated stock notes for Safety Helmets.", now.AddDays(-1).AddHours(11)),
            Log(organizationId, layla, "Created", "Company", Guid.NewGuid().ToString(), "Desert Parts LLC", $"{DemoMarker} Added client Desert Parts LLC.", now.AddHours(-4)),

            Log(organizationId, admin, "Login", "Auth", null, null, $"{DemoMarker} Admin reviewed activity.", now.AddHours(-1)),
        };

        db.AuditLogs.AddRange(logs);
        await db.SaveChangesAsync();
    }

    /// <summary>
    /// Seeds companies, products, orders, and invoices for the OrderCraft org
    /// so the dashboard Needs attention / Overview cards have real numbers.
    /// Idempotent via DEMO-* order numbers.
    /// </summary>
    private static async Task EnsureOrderCraftOpsDemoAsync(
        ApplicationDbContext db,
        User admin,
        IReadOnlyList<User> employees,
        Guid organizationId)
    {
        if (await db.Orders.IgnoreQueryFilters().AnyAsync(o =>
                o.OrganizationId == organizationId &&
                !o.IsDeleted &&
                o.OrderNumber.StartsWith("DEMO-")))
            return;

        var sara = employees.FirstOrDefault(e => e.Username == "sara.procurement") ?? admin;
        var omar = employees.FirstOrDefault(e => e.Username == "omar.finance") ?? admin;
        var layla = employees.FirstOrDefault(e => e.Username == "layla.buyer") ?? admin;
        var now = DateTime.UtcNow;

        var vendor = await db.Companies.IgnoreQueryFilters().FirstOrDefaultAsync(c =>
            c.OrganizationId == organizationId &&
            !c.IsDeleted &&
            c.Name == "Gulf Supply Co.");
        if (vendor is null)
        {
            vendor = new Company
            {
                OrganizationId = organizationId,
                Name = "Gulf Supply Co.",
                Email = "sales@gulfsupply.demo",
                Phone = "+15551002001",
                Address = "12 Industrial Rd",
                Type = CompanyType.Supplier,
                Status = CompanyStatus.Active,
                PaymentTerm = "Net 30",
                PerformanceScore = 4.5m,
                CreatedAt = now.AddDays(-20)
            };
            db.Companies.Add(vendor);
        }

        var client = await db.Companies.IgnoreQueryFilters().FirstOrDefaultAsync(c =>
            c.OrganizationId == organizationId &&
            !c.IsDeleted &&
            c.Name == "Desert Parts LLC");
        if (client is null)
        {
            client = new Company
            {
                OrganizationId = organizationId,
                Name = "Desert Parts LLC",
                Email = "orders@desertparts.demo",
                Phone = "+15551002002",
                Address = "88 Trade Ave",
                Type = CompanyType.Buyer,
                Status = CompanyStatus.Active,
                CreditLimit = 50000m,
                PaymentTerm = "Net 30",
                CreatedAt = now.AddDays(-18)
            };
            db.Companies.Add(client);
        }

        await db.SaveChangesAsync();

        var gloves = await EnsureDemoProductAsync(
            db, organizationId, vendor.Id, "Industrial Gloves XL", "GLV-XL-01", 12.50m, 400, now.AddDays(-19));
        var helmets = await EnsureDemoProductAsync(
            db, organizationId, vendor.Id, "Safety Helmets", "HLM-STD-01", 28.00m, 180, now.AddDays(-19));
        var vests = await EnsureDemoProductAsync(
            db, organizationId, vendor.Id, "Hi-Vis Vests", "VST-HV-01", 9.75m, 260, now.AddDays(-15));
        await db.SaveChangesAsync();

        // Pending approvals (Needs attention)
        var pendingA = BuildDemoOrder(
            organizationId, admin.Id, "DEMO-PO-1001", OrderStatus.Pending,
            vendor, "OrderCraft", now.AddDays(-5), gloves, 40, 0m);
        var pendingB = BuildDemoOrder(
            organizationId, sara.Id, "DEMO-PO-1002", OrderStatus.Pending,
            vendor, "OrderCraft", now.AddDays(-3), helmets, 25, 0m);
        var pendingC = BuildDemoOrder(
            organizationId, layla.Id, "DEMO-PO-1003", OrderStatus.Pending,
            vendor, "OrderCraft", now.AddDays(-2), vests, 60, 0m);
        var pendingD = BuildDemoOrder(
            organizationId, sara.Id, "DEMO-PO-1004", OrderStatus.Pending,
            vendor, "OrderCraft", now.AddDays(-1), gloves, 20, helmets, 10);
        var pendingE = BuildDemoOrder(
            organizationId, layla.Id, "DEMO-PO-1005", OrderStatus.Pending,
            vendor, "OrderCraft", now.AddHours(-10), vests, 35, 0m);

        // Drafts
        var draftA = BuildDemoOrder(
            organizationId, sara.Id, "DEMO-PO-1006", OrderStatus.Draft,
            vendor, "OrderCraft", now.AddDays(-4), gloves, 15, 0m);
        var draftB = BuildDemoOrder(
            organizationId, layla.Id, "DEMO-PO-1007", OrderStatus.Draft,
            vendor, "OrderCraft", now.AddDays(-1), helmets, 8, 0m);

        // Approved (Overview + invoiceable)
        var approvedA = BuildDemoOrder(
            organizationId, sara.Id, "DEMO-PO-1008", OrderStatus.Approved,
            vendor, "OrderCraft", now.AddDays(-12), gloves, 100, 0m);
        var approvedB = BuildDemoOrder(
            organizationId, admin.Id, "DEMO-PO-1009", OrderStatus.Approved,
            vendor, "OrderCraft", now.AddDays(-8), helmets, 50, 0m);
        var approvedC = BuildDemoOrder(
            organizationId, layla.Id, "DEMO-PO-1010", OrderStatus.Approved,
            vendor, "OrderCraft", now.AddDays(-6), vests, 80, 0m);

        // Older approved (prior 30d window) for trend contrast
        var approvedOld = BuildDemoOrder(
            organizationId, sara.Id, "DEMO-PO-0901", OrderStatus.Approved,
            vendor, "OrderCraft", now.AddDays(-45), gloves, 30, 0m);

        var orders = new[]
        {
            pendingA, pendingB, pendingC, pendingD, pendingE,
            draftA, draftB,
            approvedA, approvedB, approvedC, approvedOld
        };
        db.Orders.AddRange(orders);
        await db.SaveChangesAsync();

        var invOpen = new Invoice
        {
            OrganizationId = organizationId,
            OrderId = approvedA.Id,
            InvoiceNumber = "DEMO-INV-2001",
            Currency = "USD",
            Amount = approvedA.TotalAmount,
            Status = InvoiceStatus.Unpaid,
            DueDate = now.AddDays(20)
        };
        var invPartial = new Invoice
        {
            OrganizationId = organizationId,
            OrderId = approvedB.Id,
            InvoiceNumber = "DEMO-INV-2002",
            Currency = "USD",
            Amount = approvedB.TotalAmount,
            Status = InvoiceStatus.PartiallyPaid,
            DueDate = now.AddDays(10)
        };
        var invOverdue = new Invoice
        {
            OrganizationId = organizationId,
            OrderId = approvedC.Id,
            InvoiceNumber = "DEMO-INV-2003",
            Currency = "USD",
            Amount = approvedC.TotalAmount,
            Status = InvoiceStatus.Overdue,
            DueDate = now.AddDays(-12)
        };
        var invPaid = new Invoice
        {
            OrganizationId = organizationId,
            OrderId = approvedOld.Id,
            InvoiceNumber = "DEMO-INV-1901",
            Currency = "USD",
            Amount = approvedOld.TotalAmount,
            Status = InvoiceStatus.Paid,
            DueDate = now.AddDays(-40)
        };

        db.Invoices.AddRange(invOpen, invPartial, invOverdue, invPaid);
        await db.SaveChangesAsync();

        db.Payments.AddRange(
            new Payment
            {
                OrganizationId = organizationId,
                InvoiceId = invPartial.Id,
                Amount = InvoiceMoney.Round(approvedB.TotalAmount * 0.4m),
                RecordedByUserId = omar.Id,
                RecordedByName = omar.FullName,
                PaidAt = now.AddDays(-2)
            },
            new Payment
            {
                OrganizationId = organizationId,
                InvoiceId = invPaid.Id,
                Amount = approvedOld.TotalAmount,
                RecordedByUserId = omar.Id,
                RecordedByName = omar.FullName,
                PaidAt = now.AddDays(-35)
            });

        vendor.OrderCount = orders.Length;
        vendor.TotalSpend = orders
            .Where(o => o.Status is OrderStatus.Approved or OrderStatus.Pending)
            .Sum(o => o.TotalAmount);
        client.OrderCount = 0;

        await db.SaveChangesAsync();
    }

    private static async Task<Product> EnsureDemoProductAsync(
        ApplicationDbContext db,
        Guid organizationId,
        Guid companyId,
        string name,
        string sku,
        decimal price,
        int stock,
        DateTime createdAt)
    {
        var existing = await db.Products.IgnoreQueryFilters().FirstOrDefaultAsync(p =>
            p.OrganizationId == organizationId &&
            !p.IsDeleted &&
            p.SKU == sku);
        if (existing is not null)
            return existing;

        var product = new Product
        {
            OrganizationId = organizationId,
            CompanyId = companyId,
            Name = name,
            SKU = sku,
            Price = price,
            StockQuantity = stock,
            IsActive = true,
            Description = $"{DemoMarker} catalog item"
        };
        db.Products.Add(product);
        return product;
    }

    private static Order BuildDemoOrder(
        Guid organizationId,
        Guid createdByUserId,
        string orderNumber,
        OrderStatus status,
        Company vendor,
        string buyerName,
        DateTime orderDate,
        Product product,
        int quantity,
        decimal discount)
    {
        var lineTotal = InvoiceMoney.Round(product.Price * quantity - discount);
        var taxRate = 5m;
        var total = lineTotal + InvoiceMoney.Tax(lineTotal, taxRate);
        return new Order
        {
            OrganizationId = organizationId,
            OrderNumber = orderNumber,
            Direction = OrderDirection.Purchase,
            BuyerCompanyId = null,
            BuyerCompanyName = buyerName,
            SupplierCompanyId = vendor.Id,
            SupplierCompanyName = vendor.Name,
            CreatedByUserId = createdByUserId,
            Status = status,
            TotalAmount = total,
            OrderDate = orderDate,
            DeliveryDate = orderDate.AddDays(14),
            PaymentTerms = PaymentTerms.Net30,
            TaxRate = taxRate,
            Notes = $"{DemoMarker} seeded for dashboard",
            OrderItems =
            {
                new OrderItem
                {
                    ProductId = product.Id,
                    Quantity = quantity,
                    UnitPrice = product.Price,
                    DiscountAmount = discount,
                    TotalPrice = lineTotal
                }
            }
        };
    }

    private static Order BuildDemoOrder(
        Guid organizationId,
        Guid createdByUserId,
        string orderNumber,
        OrderStatus status,
        Company vendor,
        string buyerName,
        DateTime orderDate,
        Product productA,
        int qtyA,
        Product productB,
        int qtyB)
    {
        var lineA = InvoiceMoney.Round(productA.Price * qtyA);
        var lineB = InvoiceMoney.Round(productB.Price * qtyB);
        var subtotal = lineA + lineB;
        var taxRate = 5m;
        var total = subtotal + InvoiceMoney.Tax(subtotal, taxRate);
        return new Order
        {
            OrganizationId = organizationId,
            OrderNumber = orderNumber,
            Direction = OrderDirection.Purchase,
            BuyerCompanyId = null,
            BuyerCompanyName = buyerName,
            SupplierCompanyId = vendor.Id,
            SupplierCompanyName = vendor.Name,
            CreatedByUserId = createdByUserId,
            Status = status,
            TotalAmount = total,
            OrderDate = orderDate,
            DeliveryDate = orderDate.AddDays(14),
            PaymentTerms = PaymentTerms.Net30,
            TaxRate = taxRate,
            Notes = $"{DemoMarker} seeded for dashboard",
            OrderItems =
            {
                new OrderItem
                {
                    ProductId = productA.Id,
                    Quantity = qtyA,
                    UnitPrice = productA.Price,
                    DiscountAmount = 0m,
                    TotalPrice = lineA
                },
                new OrderItem
                {
                    ProductId = productB.Id,
                    Quantity = qtyB,
                    UnitPrice = productB.Price,
                    DiscountAmount = 0m,
                    TotalPrice = lineB
                }
            }
        };
    }

    private static async Task EnsurePlatformAdminAsync(ApplicationDbContext db, IPasswordService passwords)
    {
        var existing = await db.Users.FirstOrDefaultAsync(u =>
            !u.IsDeleted && u.Username.ToLower() == "platform.admin");
        if (existing is not null)
        {
            if (!existing.IsPlatformAdmin)
            {
                existing.IsPlatformAdmin = true;
                await db.SaveChangesAsync();
            }
            return;
        }

        db.Users.Add(new User
        {
            Username = "platform.admin",
            FullName = "Platform Super Admin Account",
            Email = "platform.admin@ordercraft.local",
            PasswordHash = passwords.HashPassword("Admin@123"),
            Role = UserRole.Admin,
            PhoneNumber = "+10000000001",
            Department = "Platform",
            IsPlatformAdmin = true,
            IsActive = true,
            CreatedAt = DateTime.UtcNow.AddDays(-30)
        });
        await db.SaveChangesAsync();
    }

    private static async Task EnsureTestTenantsAsync(
        ApplicationDbContext db,
        IPasswordService passwords,
        IOrgCatalogService catalog)
    {
        var gulf = await EnsureOrganizationAsync(db, catalog, "Gulf Procurement", "gulf-procurement");
        var nile = await EnsureOrganizationAsync(db, catalog, "Nile Trading", "nile-trading");

        var gulfAdmin = await EnsureUserAsync(
            db,
            passwords,
            "gulf.admin",
            "Gulf Tenant Admin Account",
            "gulf.admin@gulf-procurement.local",
            UserRole.Admin,
            "Administration",
            "+15552002001");
        var nileAdmin = await EnsureUserAsync(
            db,
            passwords,
            "nile.admin",
            "Nile Tenant Admin Account",
            "nile.admin@nile-trading.local",
            UserRole.Admin,
            "Administration",
            "+15552002002");

        await EnsureMembershipAsync(db, catalog, gulf, gulfAdmin, UserRole.Admin, "Administration");
        await EnsureMembershipAsync(db, catalog, nile, nileAdmin, UserRole.Admin, "Administration");

        await EnsureSampleCompanyAsync(
            db,
            gulf.Id,
            "Gulf Steel Trading",
            "vendor@gulf-procurement.test",
            CompanyType.Supplier);
        await EnsureSampleCompanyAsync(
            db,
            nile.Id,
            "Nile Office Supplies",
            "sales@nile-trading.test",
            CompanyType.Buyer);

        if (db.ChangeTracker.HasChanges())
            await db.SaveChangesAsync();
    }

    private static async Task<Organization> EnsureOrganizationAsync(
        ApplicationDbContext db,
        IOrgCatalogService catalog,
        string name,
        string slug)
    {
        var org = await db.Organizations.FirstOrDefaultAsync(o => o.Slug == slug);
        if (org is not null)
        {
            if (string.IsNullOrWhiteSpace(org.EnabledPageKeys))
            {
                org.EnabledPageKeys = AppPages.SerializeEnabledKeys(AppPages.DefaultEnabledKeys);
                await db.SaveChangesAsync();
            }
            await catalog.EnsureDefaultsAsync(org.Id);
            return org;
        }

        org = new Organization
        {
            Name = name,
            Slug = slug,
            IsActive = true,
            EnabledPageKeys = AppPages.SerializeEnabledKeys(AppPages.DefaultEnabledKeys),
            CreatedAt = DateTime.UtcNow.AddDays(-7)
        };
        db.Organizations.Add(org);
        await db.SaveChangesAsync();
        await catalog.EnsureDefaultsAsync(org.Id);
        return org;
    }

    private static async Task EnsureMembershipAsync(
        ApplicationDbContext db,
        IOrgCatalogService catalog,
        Organization org,
        User user,
        UserRole role,
        string? departmentName)
    {
        await catalog.EnsureDefaultsAsync(org.Id);
        var orgRole = await catalog.RequireRoleAsync(org.Id, role);
        OrganizationDepartment? department = null;
        if (!string.IsNullOrWhiteSpace(departmentName))
        {
            department = await db.OrganizationDepartments.IgnoreQueryFilters()
                .FirstOrDefaultAsync(d =>
                    d.OrganizationId == org.Id && d.Name.ToLower() == departmentName.Trim().ToLower());
        }

        var membership = await db.OrganizationMemberships
            .FirstOrDefaultAsync(m => m.OrganizationId == org.Id && m.UserId == user.Id);

        if (membership is not null)
        {
            if (membership.Role != role || membership.OrganizationRoleId != orgRole.Id)
            {
                UserMappings.AssignCatalog(membership, orgRole, department);
                var previous = await db.UserPagePermissions
                    .Where(p => p.MembershipId == membership.Id)
                    .ToListAsync();
                db.UserPagePermissions.RemoveRange(previous);
                UserMappings.SeedDefaultPermissions(db, membership, role);
            }
            return;
        }

        membership = new OrganizationMembership
        {
            OrganizationId = org.Id,
            UserId = user.Id,
            Status = MembershipStatus.Active,
            PasswordHash = user.PasswordHash,
            CreatedAt = user.CreatedAt == default ? DateTime.UtcNow.AddDays(-7) : user.CreatedAt,
            User = user
        };
        UserMappings.AssignCatalog(membership, orgRole, department);
        db.OrganizationMemberships.Add(membership);
        UserMappings.SeedDefaultPermissions(db, membership, role);
    }

    private static async Task<User> EnsureUserAsync(
        ApplicationDbContext db,
        IPasswordService passwords,
        string username,
        string fullName,
        string email,
        UserRole role,
        string department,
        string phone)
    {
        var existing = await db.Users.FirstOrDefaultAsync(u =>
            !u.IsDeleted && u.Username.ToLower() == username);
        if (existing is not null)
            return existing;

        var user = new User
        {
            Username = username,
            FullName = fullName,
            Email = email,
            PasswordHash = passwords.HashPassword(DemoPassword),
            Role = role,
            PhoneNumber = phone,
            Department = department,
            IsActive = true,
            CreatedAt = DateTime.UtcNow.AddDays(-7)
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        return user;
    }

    private static async Task EnsureSampleCompanyAsync(
        ApplicationDbContext db,
        Guid organizationId,
        string name,
        string email,
        CompanyType type)
    {
        var exists = await db.Companies.IgnoreQueryFilters().AnyAsync(c =>
            c.OrganizationId == organizationId && c.Name == name && !c.IsDeleted);
        if (exists)
            return;

        db.Companies.Add(new Company
        {
            OrganizationId = organizationId,
            Name = name,
            Email = email,
            Phone = "+15550000000",
            Address = "Sample tenant data",
            Type = type,
            Status = CompanyStatus.Active,
            CreatedAt = DateTime.UtcNow.AddDays(-3)
        });
    }

    private static AuditLog Log(
        Guid organizationId,
        User actor,
        string action,
        string entityType,
        string? entityId,
        string? entityLabel,
        string summary,
        DateTime createdAt) =>
        new()
        {
            OrganizationId = organizationId,
            ActorUserId = actor.Id,
            ActorName = actor.FullName,
            Action = action,
            EntityType = entityType,
            EntityId = entityId,
            EntityLabel = entityLabel,
            Summary = summary,
            CreatedAt = createdAt
        };
}
