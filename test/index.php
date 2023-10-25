<?php

echo "hola";

try {
	$host =     "212.227.229.185";
	$puerto =   3306;
	$db =       "alexnomes";
	$usuario =  "alexnomes2";
	$clave =    "s9OCC_wb[Jp(o@uw";
	
	$dsn = "mysql:host=$host;port=$puerto;dbname=$db;charset=utf8mb4";
	
	$pdo = new PDO($dsn, $usuario, $clave, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
	
	$pdo->exec('CREATE TABLE IF NOT EXISTS test (id int NOT NULL, name varchar(200) NOT NULL, PRIMARY KEY (id))');
	
} catch (PDOException $e) {
	echo "error" .$e;
	die();
};

echo "hello";
 ?>