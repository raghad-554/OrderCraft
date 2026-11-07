using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OrderCraft.Migrations
{
    /// <inheritdoc />
    public partial class OrderOrganizationParty : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<Guid>(
                name: "SupplierCompanyId",
                table: "Orders",
                type: "uuid",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uuid");

            migrationBuilder.AlterColumn<Guid>(
                name: "BuyerCompanyId",
                table: "Orders",
                type: "uuid",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uuid");

            migrationBuilder.AddColumn<string>(
                name: "Direction",
                table: "Orders",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "Purchase");

            migrationBuilder.Sql(
                """
                UPDATE "Orders" AS o
                SET "BuyerCompanyName" = org."Name",
                    "BuyerCompanyId" = NULL
                FROM "Organizations" AS org
                WHERE o."OrganizationId" = org."Id";

                UPDATE "Companies" AS c
                SET "OrderCount" = (
                    SELECT COUNT(*)
                    FROM "Orders" AS o
                    WHERE o."IsDeleted" = false
                      AND (o."BuyerCompanyId" = c."Id" OR o."SupplierCompanyId" = c."Id")
                );
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Direction",
                table: "Orders");

            migrationBuilder.AlterColumn<Guid>(
                name: "SupplierCompanyId",
                table: "Orders",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);

            migrationBuilder.AlterColumn<Guid>(
                name: "BuyerCompanyId",
                table: "Orders",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);
        }
    }
}
