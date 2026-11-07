using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OrderCraft.Migrations
{
    [DbContext(typeof(Services.ApplicationDbContext))]
    [Migration("20261031204500_OrgRolesAndDepartments")]
    public partial class OrgRolesAndDepartments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "OrganizationRoles",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OrganizationId = table.Column<Guid>(type: "uuid", nullable: false),
                    Key = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    Name = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    Template = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    IsSystem = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OrganizationRoles", x => x.Id);
                    table.ForeignKey(
                        name: "FK_OrganizationRoles_Organizations_OrganizationId",
                        column: x => x.OrganizationId,
                        principalTable: "Organizations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "OrganizationDepartments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OrganizationId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OrganizationDepartments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_OrganizationDepartments_Organizations_OrganizationId",
                        column: x => x.OrganizationId,
                        principalTable: "Organizations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_OrganizationRoles_OrganizationId_Key",
                table: "OrganizationRoles",
                columns: new[] { "OrganizationId", "Key" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_OrganizationRoles_OrganizationId_Name",
                table: "OrganizationRoles",
                columns: new[] { "OrganizationId", "Name" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_OrganizationDepartments_OrganizationId_Name",
                table: "OrganizationDepartments",
                columns: new[] { "OrganizationId", "Name" },
                unique: true);

            migrationBuilder.AddColumn<Guid>(
                name: "OrganizationRoleId",
                table: "OrganizationMemberships",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "OrganizationDepartmentId",
                table: "OrganizationMemberships",
                type: "uuid",
                nullable: true);

            migrationBuilder.Sql("""
                INSERT INTO "OrganizationRoles" ("Id", "OrganizationId", "Key", "Name", "Template", "IsSystem", "IsActive", "SortOrder", "CreatedAt")
                SELECT gen_random_uuid(), o."Id", v."Key", v."Name", v."Template", v."IsSystem", TRUE, v."SortOrder", CURRENT_TIMESTAMP
                FROM "Organizations" o
                CROSS JOIN (
                    VALUES
                        ('Admin', 'Admin', 'Admin', TRUE, 0),
                        ('ProcurementManager', 'Procurement Manager', 'ProcurementManager', FALSE, 1),
                        ('Finance', 'Finance', 'Finance', FALSE, 2)
                ) AS v("Key", "Name", "Template", "IsSystem", "SortOrder");

                INSERT INTO "OrganizationDepartments" ("Id", "OrganizationId", "Name", "IsActive", "SortOrder", "CreatedAt")
                SELECT gen_random_uuid(), o."Id", v."Name", TRUE, v."SortOrder", CURRENT_TIMESTAMP
                FROM "Organizations" o
                CROSS JOIN (
                    VALUES
                        ('Administration', 0),
                        ('Procurement', 1),
                        ('Finance', 2)
                ) AS v("Name", "SortOrder");

                INSERT INTO "OrganizationDepartments" ("Id", "OrganizationId", "Name", "IsActive", "SortOrder", "CreatedAt")
                SELECT gen_random_uuid(), m."OrganizationId", TRIM(u."Department"), TRUE, 10, CURRENT_TIMESTAMP
                FROM "OrganizationMemberships" m
                JOIN "Users" u ON u."Id" = m."UserId"
                WHERE u."Department" IS NOT NULL AND TRIM(u."Department") <> ''
                  AND NOT EXISTS (
                      SELECT 1 FROM "OrganizationDepartments" d
                      WHERE d."OrganizationId" = m."OrganizationId"
                        AND LOWER(d."Name") = LOWER(TRIM(u."Department"))
                  )
                GROUP BY m."OrganizationId", TRIM(u."Department");

                UPDATE "OrganizationMemberships" m
                SET "OrganizationRoleId" = r."Id"
                FROM "OrganizationRoles" r
                WHERE r."OrganizationId" = m."OrganizationId"
                  AND r."Key" = m."Role";

                UPDATE "OrganizationMemberships" m
                SET "OrganizationRoleId" = r."Id"
                FROM "OrganizationRoles" r
                WHERE m."OrganizationRoleId" IS NULL
                  AND r."OrganizationId" = m."OrganizationId"
                  AND r."Key" = 'ProcurementManager';

                UPDATE "OrganizationMemberships" m
                SET "OrganizationDepartmentId" = d."Id"
                FROM "Users" u, "OrganizationDepartments" d
                WHERE m."UserId" = u."Id"
                  AND d."OrganizationId" = m."OrganizationId"
                  AND u."Department" IS NOT NULL
                  AND TRIM(u."Department") <> ''
                  AND LOWER(d."Name") = LOWER(TRIM(u."Department"));
                """);

            migrationBuilder.AlterColumn<Guid>(
                name: "OrganizationRoleId",
                table: "OrganizationMemberships",
                type: "uuid",
                nullable: false,
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_OrganizationMemberships_OrganizationRoleId",
                table: "OrganizationMemberships",
                column: "OrganizationRoleId");

            migrationBuilder.CreateIndex(
                name: "IX_OrganizationMemberships_OrganizationDepartmentId",
                table: "OrganizationMemberships",
                column: "OrganizationDepartmentId");

            migrationBuilder.AddForeignKey(
                name: "FK_OrganizationMemberships_OrganizationRoles_OrganizationRoleId",
                table: "OrganizationMemberships",
                column: "OrganizationRoleId",
                principalTable: "OrganizationRoles",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_OrganizationMemberships_OrganizationDepartments_OrganizationDepartmentId",
                table: "OrganizationMemberships",
                column: "OrganizationDepartmentId",
                principalTable: "OrganizationDepartments",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_OrganizationMemberships_OrganizationRoles_OrganizationRoleId",
                table: "OrganizationMemberships");

            migrationBuilder.DropForeignKey(
                name: "FK_OrganizationMemberships_OrganizationDepartments_OrganizationDepartmentId",
                table: "OrganizationMemberships");

            migrationBuilder.DropIndex(
                name: "IX_OrganizationMemberships_OrganizationRoleId",
                table: "OrganizationMemberships");

            migrationBuilder.DropIndex(
                name: "IX_OrganizationMemberships_OrganizationDepartmentId",
                table: "OrganizationMemberships");

            migrationBuilder.DropColumn(
                name: "OrganizationRoleId",
                table: "OrganizationMemberships");

            migrationBuilder.DropColumn(
                name: "OrganizationDepartmentId",
                table: "OrganizationMemberships");

            migrationBuilder.DropTable(name: "OrganizationRoles");
            migrationBuilder.DropTable(name: "OrganizationDepartments");
        }
    }
}
