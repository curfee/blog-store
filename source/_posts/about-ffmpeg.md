---
title: ffmpeg初体验
date: 2025-04-22 22:17:56
tags:
---
![:o](yummy_.png)
<!--more-->
# 初见面
依稀记得两年前因为有软件需要path ffmpeg才能正常导出文件,便去官网下载该文件<font size="1"><del>(一开始还错下源代码来着)</del></font>
之后有尝试着点击exe文件,见没反应之后很快对其失去了兴趣,便很久没有管它了
不过就在前几日,无意间刷到说是有款万能软件可以转换任何视频格式,竟发现up在用ffmpeg敲代码!!!
这时才恍然大悟,原来[ffmpeg](https://ffmpeg.org/)是转换软件啊...
***
## 初接触
没想到当初觉得没用的exe竟然是靠命令行执行的
```powershell
E:\ffmpeg-2025-04-17-git-7684243fbe-full_build\bin\ffmpeg.exe(下载ffmpeg.exe的路径) -i "<input_files>" <output_files>
```
这便是最基础的ffmpeg转换指令,如果转换完之后发现文件没在同目录下<del>那就对了</del>是因为没给ffmpeg指定特定导出目录变导出到默认用户目录了
这时便加上导出目录`指定目录+<output_files>`便可导出到指定目录

将ffmpeg的bin目录加入环境变量的path里面便可直接再命令行调用ffmpeg命令
```
ffmpeg -v
```
![如有返回版本信息便代表成功了](s_ffpeg_version.jpeg)
## 尝试理解
把[官方文档(汉化过的)](https://ffmpeg.github.net.cn/ffmpeg.html)简单浏览后得出的结论是:

<b>各种格式的视频本质就是一个组合文件,内部含有视频流,音频流,字幕流等等等等
而ffmpeg的作用就是将视频内的流进行重编码组合然后导出</b>

目前选项分为输入选项(放输入文件前),输出选项(放输出文件前),和全局选项(放哪里都是全局生效)

__<font color ="#5c181b"><font size="2">~~由于文档讲的太多了~~</font>列几个认为较为重要的选项</font>__


`-c`这个比较重要,这个命令可以单独选择流编码器或跳过编码,如要查询编码器名称可以使用`ffmpeg -codecs`去查找
`-c:v`就是对单独的视频(video)流进行编码
`-c:a`同理,但是这个视音频(audio)流
`-c copy`就是跳过解码直接输出,可以搭配上两个选项进行单独跳过编码
`-map`这个就是用来选择视频里的流,多个视频同样可以选择,如导入两个视频的话`-map 0:v`便是选择了第一个导入视频的视频流`-map 1:a`就是选择了第二个导入视频的音频流,这边可以控制流进行多视频合并或修改等等
`-frames`设置流的总帧数,例如`-frames:v 300`就是设置该视频总时长为300/30=10秒
`-r`这个就是设置全局视频帧数`-r 10`就会得到每秒只有10帧的视频
`-b`则是设置视频的[比特率](https://zh.wikipedia.org/wiki/%E6%AF%94%E7%89%B9%E7%8E%87)的,码率越高质量越好且同样可以分音频流和视频流
`-b:v 12800 -b:a 9600`则会得到一个来自千禧年的时空胶囊~~ 
<p align ="center">
    <img src ="v128k_a96k_isbad.png" style="max-width:100%; height:auto;">
    <font size="1"><del>事实上效果比千禧年还烂2333</del></font> </p align ="center">

`-ss`和`-t`分别为起始时间和持续时间,这样一来可以满足一些需要快速剪辑的场景 `-ss 00:01:00 -t 3`就是从一秒开始,之后视频持续三秒结束
`-t`也可以替换为`-to`从而从持续时间变为结束时间
`-stream_loop`为循环视频&&音频,此选项一定要放在导入流前面才能生效`-stream_loop -1`则是无限循环
`-shortest`用于输出文件的长度与输入流中最短的那个流对齐,解决了音频播完了视频还在播的情况,这个例子最好搭配`-stream_loop -1`来使用
`-vf`虽说是个滤镜命令，但可以同时设置视频长度,大小,滤镜,帧率,旋转等等效果。这里举几个常用的例子
`-vf "scale=宽:高"`控制视频都整体大小,其中一个数值设置`-1`便可以锁定高宽比
`-vf "crop=宽度:高度:[x坐标:y坐标]"`选定其位置进行剪切
`-vf "transpose=方向"`就是旋转视频方向,使用0,1,2,3来控制视频的旋转方向
更多命令可以在[官方文档](https://ffmpeg.org/ffmpeg-filters.html?spm=5176.28103460.0.0.28fe1db8VfLtEz)或使用`ffmpeg -filters`查找
`-af`跟vf一样,只不过是对音频的滤镜<font color="#d9d9d9">如果再赘述的话还不如直接用Au演示</font>
***

## Dive in
既然都是命令行控制了,这不整点好玩的?
和批处理结合就可以整个自定义批量转换视频格式

```bat
@echo off
setlocal enabledelayedexpansion
chcp 65001

set /p vip=输入原视频路径
set old_vid=%vip%

set /p or_fmat=输入该路径下需要转化的格式
set old_format=%or_fmat%

set /p vio=输出视频路径
set new_vid=%vio%

set /p nw_fmat=输入要转化的格式
set new_format=%nw_fmat%
set new_format=.%new_format%

echo 输入路径为%old_vid% ^
输出路径为%new_vid% ^
即将开始转换...


for %%q in ("%old_vid%\*.%old_format%") do (
    echo 开始转化%%q
    set "newname=%%~nq"
    set "Dir_p_newvid=!new_vid!\!newname!!new_format!"
    echo fomat"!new_format!"
    echo name"!newname!"
    echo path"!new_vid!"
    echo "!Dir_p_newvid!"
    ffmpeg -i "%%q" ^
"!Dir_p_newvid!"
    echo finished!!newname!
)
pause
```
<center><font size="1"><font color=" #9e9e9e">不得不说批处理对空格异常敏感</font></center>
这里ffmpeg只有一行是本体,同时这行也决定了视频的质量,但由于这里没设置编码器质量和其他选项会导致其输出的视频质量出奇的低,<del>想用的话建议还是自己改改再用</del>

另外提一嘴,写批处理脚本时用`^`便可以将那一大长串的字符串换行
```bat
ffmpeg -i "<input_files>" ^
-c:v copy ^
<output_files>
```
这样如果配置多了也不至于太乱

ffmpeg也不止于转换视频文件,同样可以转化图片
转换操作和视频转换差不多
```
ffmpeg -i <inputimages> <outputimages>
```
即可转换格式
![即便如此其选项还是使用视频流的(video)](the_image_conversions.png)
***
### 最后
虽然现在还是习惯使用带UI的转格式软件,但ffmpeg却让我倍感兴奋,或是学新东西时的激动,抑或是如此专注的学习让自己感觉良好,已经很久没有这么投入的做一件事了

最后就放一个纯音视频结合的例子吧

```powershell
ffmpeg -i "D:\ram\Desktop\file_combie\The Last Time I Saw You - Housecat.mp3" -stream_loop -1 -i "D:\ram\Desktop\file_combie\spr_1.webm" -b:v 640k -c:v hevc_nvenc -c:a libopus -vf "scale=1080:720 , deblock=1:5" -ss 00:00:00 -to 00:04:37 -b:a 78k -shortest -r 30 "C:\Users\LZTeam\Desktop\spring.mp4"
```

<center><font size="2">效果...好像还说的过去?</font></center>


<video width="100%" height="100%" controls>
    <source src="spring.mp4" alt="enjoy!" type="video/mp4">
</video>

<center>(・ω・)</center>


***