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
        var exists = await db.OrganizationMemberships.AnyAsync(m =>
            m.OrganizationId == org.Id && m.UserId == user.Id);
        if (exists)
            return;

        await catalog.EnsureDefaultsAsync(org.Id);
        var orgRole = await catalog.RequireRoleAsync(org.Id, role);
        OrganizationDepartment? department = null;
        if (!string.IsNullOrWhiteSpace(departmentName))
        {
            department = await db.OrganizationDepartments.IgnoreQueryFilters()
                .FirstOrDefaultAsync(d =>
                    d.OrganizationId == org.Id && d.Name.ToLower() == departmentName.Trim().ToLower());
        }

        var membership = new OrganizationMembership
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
