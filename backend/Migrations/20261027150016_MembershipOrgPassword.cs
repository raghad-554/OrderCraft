using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OrderCraft.Migrations
{
    /// <inheritdoc />
    public partial class MembershipOrgPassword : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "PasswordHash",
                table: "OrganizationMemberships",
                type: "character varying(512)",
                maxLength: 512,
                nullable: false,
                defaultValue: "");

            migrationBuilder.Sql(
                """
                UPDATE "OrganizationMemberships" AS m
                SET "PasswordHash" = u."PasswordHash"
                FROM "Users" AS u
                WHERE m."UserId" = u."Id"
                  AND (m."PasswordHash" IS NULL OR m."PasswordHash" = '');
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PasswordHash",
                table: "OrganizationMemberships");
        }
    }
}
