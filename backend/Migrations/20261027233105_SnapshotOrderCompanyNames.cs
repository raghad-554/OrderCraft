using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OrderCraft.Migrations
{
    /// <inheritdoc />
    public partial class SnapshotOrderCompanyNames : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "BuyerCompanyName",
                table: "Orders",
                type: "character varying(200)",
                maxLength: 200,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "SupplierCompanyName",
                table: "Orders",
                type: "character varying(200)",
                maxLength: 200,
                nullable: false,
                defaultValue: "");

            migrationBuilder.Sql(
                """
                UPDATE "Orders" AS o
                SET "BuyerCompanyName" = c."Name"
                FROM "Companies" AS c
                WHERE o."BuyerCompanyId" = c."Id";

                UPDATE "Orders" AS o
                SET "SupplierCompanyName" = c."Name"
                FROM "Companies" AS c
                WHERE o."SupplierCompanyId" = c."Id";
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "BuyerCompanyName",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "SupplierCompanyName",
                table: "Orders");
        }
    }
}
