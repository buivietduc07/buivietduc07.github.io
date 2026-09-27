<?php
require_once 'config.php';
$count_packages = mysqli_fetch_assoc(mysqli_query($conn, "SELECT COUNT(*) as c FROM tbl_projects"))['c'];
$count_keys = mysqli_fetch_assoc(mysqli_query($conn, "SELECT COUNT(*) as c FROM tbl_tokens"))['c'];
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Dashboard Admin</title>
    <link rel="stylesheet" href="theme/admin.css">
</head>
<body>
    <div class="sidebar">
        <div class="sidebar-header">API PANEL</div>
        <div class="sidebar-menu">
            <a href="index.php" class="active">Dashboard</a>
            <a href="package.php">Quản lý Package</a>
            <a href="key.php">Quản lý Key</a>
        </div>
    </div>
    <div class="main-content">
        <h2 class="page-title">Tổng quan</h2>
        <div style="display: flex; gap: 20px;">
            <div class="card" style="flex: 1; border-left: 5px solid #3498db;">
                <h3>Total Packages</h3>
                <h1><?= $count_packages ?></h1>
            </div>
            <div class="card" style="flex: 1; border-left: 5px solid #2ecc71;">
                <h3>Total Keys</h3>
                <h1><?= $count_keys ?></h1>
            </div>
        </div>
    </div>
</body>
</html>