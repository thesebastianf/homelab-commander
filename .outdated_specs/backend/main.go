package main

import (
    "fmt"
    "github.com/gin-gonic/gin"
)

func main() {
    fmt.Println("HomeLab Commander starting...")
    r := gin.Default()

    r.GET("/api/status", func(c *gin.Context) {
        c.JSON(200, gin.H{
            "status": "Commander Online",
            "vacation_mode": false,
        })
    })

    r.Run(":8080")
}
