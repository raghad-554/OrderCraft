using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OrderCraft.Migrations
{
    /// <inheritdoc />
    public partial class HideAuditLogForNonAdmins : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                UPDATE "UserPagePermissions" AS p
                SET "AccessLevel" = 'Hidden'
                FROM "OrganizationMemberships" AS m
                WHERE p."MembershipId" = m."Id"
                  AND p."PageKey" = 'auditLog'
                  AND m."Role" <> 'Admin'
                  AND p."AccessLevel" = 'View';
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                UPDATE "UserPagePermissions" AS p
                SET "AccessLevel" = 'View'
                FROM "OrganizationMemberships" AS m
                WHERE p."MembershipId" = m."Id"
                  AND p."PageKey" = 'auditLog'
                  AND m."Role" <> 'Admin'
                  AND p."AccessLevel" = 'Hidden';
                """);
        }
    }
}
