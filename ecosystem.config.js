module.exports = {
    apps: [{
        name: 'iflow',
        script: 'src/index.js',
        cwd: '/home/deploy/iflow',
        instances: 1,
        autorestart: true,
        watch: false,
        max_memory_restart: '1G',
        env: {
            NODE_ENV: 'production',
            PORT: 8080
        },
        error_file: '/home/deploy/iflow/logs/pm2-error.log',
        out_file: '/home/deploy/iflow/logs/pm2-out.log',
        log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }]
};
