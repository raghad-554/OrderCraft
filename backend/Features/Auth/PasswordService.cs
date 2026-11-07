using Microsoft.AspNetCore.Identity;
using OrderCraft.Models;

namespace OrderCraft.Services;

public class PasswordService : IPasswordService
{
    private readonly IPasswordHasher<User> _passwordHasher;

    public PasswordService(IPasswordHasher<User> passwordHasher)
    {
        _passwordHasher = passwordHasher;
    }

    public string HashPassword(string plainPassword)
    {
        if (string.IsNullOrWhiteSpace(plainPassword))
            throw new ArgumentException("Password cannot be empty.", nameof(plainPassword));

        return _passwordHasher.HashPassword(user: null!, plainPassword);
    }

    public bool VerifyPassword(string hashedPassword, string plainPassword)
    {
        if (string.IsNullOrWhiteSpace(hashedPassword) || string.IsNullOrWhiteSpace(plainPassword))
            return false;

        var result = _passwordHasher.VerifyHashedPassword(
            user: null!,
            hashedPassword,
            plainPassword);

        return result is PasswordVerificationResult.Success
            or PasswordVerificationResult.SuccessRehashNeeded;
    }
}
