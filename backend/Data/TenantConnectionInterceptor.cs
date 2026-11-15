using System.Data.Common;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Npgsql;

public class TenantConnectionInterceptor : DbConnectionInterceptor
{
    private readonly string _currentTenantId;  

    public TenantConnectionInterceptor(string currentTenantId)
    {
        _currentTenantId = currentTenantId;
    }

    public override void ConnectionOpened(DbConnection connection, ConnectionEndEventData eventData)
    {
        base.ConnectionOpened(connection, eventData);
        SetTenant(connection);
    }

    public override async Task ConnectionOpenedAsync(DbConnection connection, ConnectionEndEventData eventData, CancellationToken cancellationToken = default)
    {
        await base.ConnectionOpenedAsync(connection, eventData, cancellationToken);
        await SetTenantAsync(connection);
    }

    private void SetTenant(DbConnection connection)
    {
        if (!string.IsNullOrEmpty(_currentTenantId) && connection is NpgsqlConnection npgConnection)
        {
            using var cmd = npgConnection.CreateCommand();
            cmd.CommandText = $"SET LOCAL app.current_tenant_id = '{_currentTenantId}';";
            cmd.ExecuteNonQuery();
        }
    }

    private async Task SetTenantAsync(DbConnection connection)
    {
        if (!string.IsNullOrEmpty(_currentTenantId) && connection is NpgsqlConnection npgConnection)
        {
            using var cmd = npgConnection.CreateCommand();
            cmd.CommandText = $"SET LOCAL app.current_tenant_id = '{_currentTenantId}';";
            await cmd.ExecuteNonQueryAsync();
        }
    }
}