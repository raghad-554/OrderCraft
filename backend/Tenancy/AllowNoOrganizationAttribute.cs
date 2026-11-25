namespace OrderCraft.Tenancy;

[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public sealed class AllowNoOrganizationAttribute : Attribute;
