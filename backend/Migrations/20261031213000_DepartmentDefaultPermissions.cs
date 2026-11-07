using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OrderCraft.Migrations
{
    [DbContext(typeof(Services.ApplicationDbContext))]
    [Migration("20261031213000_DepartmentDefaultPermissions")]
    public partial class DepartmentDefaultPermissions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "OrganizationDepartmentPermissions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DepartmentId = table.Column<Guid>(type: "uuid", nullable: false),
                    PageKey = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    AccessLevel = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OrganizationDepartmentPermissions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_OrganizationDepartmentPermissions_OrganizationDepartments_DepartmentId",
                        column: x => x.DepartmentId,
                        principalTable: "OrganizationDepartments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_OrganizationDepartmentPermissions_DepartmentId_PageKey",
                table: "OrganizationDepartmentPermissions",
                columns: new[] { "DepartmentId", "PageKey" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "OrganizationDepartmentPermissions");
        }
    }
}
