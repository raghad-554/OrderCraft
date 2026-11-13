using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace OrderCraft.Models;

[Table("RevokedTokens")]
public class RevokedToken
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    [MaxLength(64)]
    public string Jti { get; set; } = string.Empty;

    public Guid? UserId { get; set; }

    public DateTime ExpiresAt { get; set; }

    public DateTime RevokedAt { get; set; } = DateTime.UtcNow;
}
