namespace OrderCraft.Services;

public interface IPasswordService
{
    string HashPassword(string plainPassword);
    bool VerifyPassword(string hashedPassword, string plainPassword);
}
