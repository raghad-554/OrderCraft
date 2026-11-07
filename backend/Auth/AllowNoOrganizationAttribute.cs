namespace OrderCraft.Auth;

[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public sealed class AllowNoOrganizationAttribute : Attribute;
