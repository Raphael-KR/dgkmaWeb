-- Checksum-consistent adversarial fixture. Static validation only; never execute.
ALTER DEFAULT PRIVILEGES FOR ROLE app_owner GRANT SELECT ON TABLES TO reporter;
