using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using OrderCraft.Services;

#nullable disable

namespace OrderCraft.Migrations
{
    [DbContext(typeof(ApplicationDbContext))]
    [Migration("20261120010000_OrganizationSettingsDefaults")]
    public partial class OrganizationSettingsDefaults : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "LogoUrl",
                table: "Organizations",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DefaultCurrency",
                table: "Organizations",
                type: "character varying(3)",
                maxLength: 3,
                nullable: false,
                defaultValue: "USD");

            migrationBuilder.AddColumn<decimal>(
                name: "DefaultTaxRate",
                table: "Organizations",
                type: "numeric(5,2)",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<string>(
                name: "DefaultPaymentTerms",
                table: "Organizations",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "Net30");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "LogoUrl", table: "Organizations");
            migrationBuilder.DropColumn(name: "DefaultCurrency", table: "Organizations");
            migrationBuilder.DropColumn(name: "DefaultTaxRate", table: "Organizations");
            migrationBuilder.DropColumn(name: "DefaultPaymentTerms", table: "Organizations");
        }
    }
}
