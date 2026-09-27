<?php
require_once 'config.php';

function genKey($length = 16) {
    return substr(str_shuffle(str_repeat($x='0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ', ceil($length/strlen($x)) )),1,$length);
}

if (isset($_POST['create_key'])) {
    $project_id = intval($_POST['project_id']);
    $type = $_POST['type'];
    $max_devices = intval($_POST['max_devices']);
    $token_code = genKey(16);
    $duration = 0;
    $expire_date = "NULL";

    if ($type == 'static') {
        $expire_date = "'" . $_POST['static_date'] . "'";
    } else {
        $duration = intval($_POST['dynamic_days']);
    }

    mysqli_query($conn, "INSERT INTO tbl_tokens (project_id, token_code, type, duration, expire_date, max_devices) VALUES ($project_id, '$token_code', '$type', $duration, $expire_date, $max_devices)");
    header("Location: key.php");
}

if (isset($_GET['delete'])) {
    $id = intval($_GET['delete']);
    mysqli_query($conn, "DELETE FROM tbl_tokens WHERE id=$id");
    header("Location: key.php");
}

$keys = mysqli_query($conn, "SELECT t.*, p.name as pname FROM tbl_tokens t JOIN tbl_projects p ON t.project_id = p.id ORDER BY t.id DESC");
$projects = mysqli_query($conn, "SELECT * FROM tbl_projects");
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Quản lý Key</title>
    <link rel="stylesheet" href="theme/admin.css">
    <script src="theme/main.js"></script>
</head>
<body>
    <div class="sidebar">
        <div class="sidebar-header">API PANEL</div>
        <div class="sidebar-menu">
            <a href="index.php">Dashboard</a>
            <a href="package.php">Quản lý Package</a>
            <a href="key.php" class="active">Quản lý Key</a>
        </div>
    </div>
    <div class="main-content">
        <h2 class="page-title">Quản lý Key</h2>
        <div class="card">
            <form method="POST">
                <div class="form-group">
                    <label>Chọn Package</label>
                    <select name="project_id" class="form-control" required>
                        <?php while ($p = mysqli_fetch_assoc($projects)): ?>
                            <option value="<?= $p['id'] ?>"><?= $p['name'] ?></option>
                        <?php endwhile; ?>
                    </select>
                </div>
                <div class="form-group">
                    <label>Loại Key</label>
                    <select name="type" id="keyType" onchange="toggleType()" class="form-control" required>
                        <option value="static">Key Tĩnh (Ngày cố định)</option>
                        <option value="dynamic">Key Động (Tính từ lúc kích hoạt)</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Số thiết bị tối đa</label>
                    <input type="number" name="max_devices" class="form-control" value="1" required>
                </div>
                <div id="staticInput" class="form-group">
                    <label>Ngày hết hạn</label>
                    <input type="datetime-local" name="static_date" class="form-control">
                </div>
                <div id="dynamicInput" class="form-group" style="display:none;">
                    <label>Số ngày sử dụng</label>
                    <input type="number" name="dynamic_days" class="form-control" placeholder="30">
                </div>
                <button type="submit" name="create_key" class="btn btn-primary">Tạo Key</button>
            </form>
        </div>

        <div class="card">
            <table>
                <thead>
                    <tr>
                        <th>Key</th>
                        <th>Package</th>
                        <th>Type</th>
                        <th>Expiry/Duration</th>
                        <th>Devices</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
                    <?php while ($row = mysqli_fetch_assoc($keys)): 
                        $used = mysqli_num_rows(mysqli_query($conn, "SELECT id FROM tbl_device_history WHERE token_id=".$row['id']));
                    ?>
                    <tr>
                        <td><span class="code-box"><?= $row['token_code'] ?></span></td>
                        <td><?= htmlspecialchars($row['pname']) ?></td>
                        <td><?= $row['type'] ?></td>
                        <td><?= ($row['type'] == 'static') ? $row['expire_date'] : ($row['expire_date'] ? $row['expire_date'] : $row['duration'].' days (Pending)') ?></td>
                        <td><?= $used ?> / <?= $row['max_devices'] ?></td>
                        <td><a href="?delete=<?= $row['id'] ?>" class="btn btn-sm btn-danger">Xóa</a></td>
                    </tr>
                    <?php endwhile; ?>
                </tbody>
            </table>
        </div>
    </div>
</body>
</html>