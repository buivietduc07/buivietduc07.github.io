<?php
require_once 'config.php';

function genToken() {
    return bin2hex(random_bytes(16));
}

if (isset($_POST['add_project'])) {
    $name = mysqli_real_escape_string($conn, $_POST['name']);
    $contact = mysqli_real_escape_string($conn, $_POST['contact']);
    $token = genToken();
    mysqli_query($conn, "INSERT INTO tbl_projects (name, project_token, contact_link) VALUES ('$name', '$token', '$contact')");
    header("Location: package.php");
}

if (isset($_GET['toggle_maint'])) {
    $id = intval($_GET['toggle_maint']);
    $current = intval($_GET['s']);
    $new = $current == 1 ? 0 : 1;
    mysqli_query($conn, "UPDATE tbl_projects SET is_maintenance=$new WHERE id=$id");
    header("Location: package.php");
}

if (isset($_GET['delete'])) {
    $id = intval($_GET['delete']);
    mysqli_query($conn, "DELETE FROM tbl_projects WHERE id=$id");
    header("Location: package.php");
}

$projects = mysqli_query($conn, "SELECT * FROM tbl_projects ORDER BY id DESC");
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Quản lý Package</title>
    <link rel="stylesheet" href="theme/admin.css">
</head>
<body>
    <div class="sidebar">
        <div class="sidebar-header">API PANEL</div>
        <div class="sidebar-menu">
            <a href="index.php">Dashboard</a>
            <a href="package.php" class="active">Quản lý Package</a>
            <a href="key.php">Quản lý Key</a>
        </div>
    </div>
    <div class="main-content">
        <h2 class="page-title">Danh sách Package</h2>
        <div class="card">
            <form method="POST">
                <div class="form-group">
                    <label>Tên Package</label>
                    <input type="text" class="form-control" name="name" required>
                </div>
                <div class="form-group">
                    <label>Link Contact (URL)</label>
                    <input type="text" class="form-control" name="contact" placeholder="https://t.me/...">
                </div>
                <button type="submit" name="add_project" class="btn btn-primary">Tạo Package</button>
            </form>
        </div>

        <div class="card">
            <table>
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Name</th>
                        <th>Project Token</th>
                        <th>Contact</th>
                        <th>Trạng thái</th>
                        <th>Hành động</th>
                    </tr>
                </thead>
                <tbody>
                    <?php while ($row = mysqli_fetch_assoc($projects)): ?>
                    <tr>
                        <td><?= $row['id'] ?></td>
                        <td><?= htmlspecialchars($row['name']) ?></td>
                        <td><span class="code-box"><?= $row['project_token'] ?></span></td>
                        <td><a href="<?= htmlspecialchars($row['contact_link']) ?>" target="_blank">Link</a></td>
                        <td>
                            <?php if($row['is_maintenance'] == 1): ?>
                                <span class="status-badge status-maint">Bảo trì</span>
                            <?php else: ?>
                                <span class="status-badge status-active">Hoạt động</span>
                            <?php endif; ?>
                        </td>
                        <td>
                            <a href="?toggle_maint=<?= $row['id'] ?>&s=<?= $row['is_maintenance'] ?>" class="btn btn-sm btn-success">Bật/Tắt BT</a>
                            <a href="?delete=<?= $row['id'] ?>" class="btn btn-sm btn-danger">Xóa</a>
                        </td>
                    </tr>
                    <?php endwhile; ?>
                </tbody>
            </table>
        </div>
    </div>
</body>
</html>