---
title: pointer
date: 2025-05-1 20:21:14
tags: C
---
one small step for me,one giant leap for C 
<p align ="center">
    <img src ="point_address.png" style="max-width:100%; height:auto;">
    <font size="1"><del>one torture for beginner</del></font> </p align ="center">
<!--more-->

# 那天,人们终于回想起了被指针支配的恐惧...
指针这个概念理解起来其实就是存储地址。可能因人而异吧,有人一遍过,有人怎么都绕不出来...
<font size ="1">我就是绕不出来的那个(</font>

指针终究对我来还是太抽象了...就像当初理解模型布线一样
只不过这次比布线更灵活,更复杂,复杂到我需要单独开篇文章帮我整理最近学到的东西
***
## pointer = &address
无论指针怎么变化,其本质就是存储其数据的地址,可难就难在数据类型变换莫测,很容易指针指着指着就迷了路...  
但先不管那么多,把最最最基础的指针用法给写出来
``` c
int i,*p;
i = 14;
p = &i;
printf("%d",*p);
```
这样子就得到了最基础的指针,该指针的输出值为`i`
除此之外
我个人认为需了解指针的话还需要理解一个重要的东西： <b>[解引](https://www.cnblogs.com/haruyuki/p/15683592.html)</b> 
如上文所示,因为当p为指针的时候其存储的值是为数据i的地址,所以如果我们直接输出p的话会得到i的**虚拟内存**的地址,只需要添加`*`便可以将p指针所指向的数据,也就是i的地址转化成`i`所赋予的值,即`14`
还有就是指向了,我认为指向这个说法很合理,但又机器抽象,总的来说指向就是指针存储了该值的地址(数组为头地址),这么一说是不是挺合理的,但是只要指针种类多起来就开始麻烦了,我个人还是更习惯理解指向为赋值,只不过这次赋予的是该值的地址罢了(个人习惯)
***
## 指针的类型&&指针所指向的类型
简单举栗
```c
int i,*p;
```
指针类型就是当定义一个指针变量(p)时**所赋予的数据类型** 所以`int*`也就是赋予了整数类型的指针
而指针所指向的类型则类似于解引一样解指针(*p)来指向**指针所指的实际数据类型**所以`int`就是指针`p`所存储的实际数据类型
这两个的作用就是检验指针的正确性,同时也证明了指针指向的内存区域的数据类型决定了该内存区域的大小
现在声明一个较为复杂的指针 
```c
int *(*ptr)[4]   
```
这个指针的意思是声明了一个ptr指针指向一个含有4个int *的指针数组
所以该指针类型就是`int *(*)[4]`也就是4个int *类型的指针数组组成
指针所指的类型为`int *[4]`也就是该指针所指的类型为4个含有int类型的指针数组

<b>其实指针类型就是把声明的值给去掉,指针所指向的类型就是把值旁边的指针给去掉</b>

现在再来看看这个
<p align ="center">
    <img src ="complex_pointer.jpeg" alt ="爱来自c社区♥" style="max-width:100%; height:auto;">
</p>

`void (*(*f[])())()`?!
先一层一层拆吧,其实上面已经有答案了,但是待我一步一步解释!
先从里面算起 `*f[]`的意思为f为数组,其内的每一个元素都是指针,`*(*f[])()`这个就很有趣了,这里的空括号相当于任何一个参数类型的指针,也就是说这时候就已转化为函数指针,其只接受空括号内指定函数类型,再套了层指针代表着该函数返回值是一个指针,然后又加了一个括号代表该返回指针又指向另一个函数,其返回类型为void也---就是不返回任何值

简单来说:<b> `f`是一个函数指针数组，数组中的每一个元素都是指针指向某个函数,这些函数又返回一个函数指针,其返回 void类型的函数</b>

<p align ="center">
    是不是已经绕晕了·?
    <img src ="confuse_goofyahh.jpg" alt ="ahhhhh_____*Dissolve" style ="max-width:100%; height:auto;">
</p>

但是现在理清楚了其他的自然就好搞了
指针类型为`void(*(*[]))`
指针所指的类型为`void(*([]))`

这下面的解释翻译一下就是:
**定义 f 为一个大小未指定的数组，该数组中的每个元素是指向返回值类型为 void 的函数的指针**

还好这串"东西"实际上基本不会用到,追求代码可读性的话套个两三层就已经很多了,所以现实写代码时不需要考虑那么复杂的声明<font size ="1"><del>给你乱指就老实了</del></font>
***
## 函数指针
上面就有提到函数指针这个概念,函数指针就是放弃了普通存储数值地址从而存储局部函数地址,注意的一点就是只有相同类型的函数才能传入,否则编译器会因为类型不符报错
另外一点就是只要局部变量是指针,那其返回(return)的值将会是该值的地址(或者指向地址的指针),这样子很利好其函数指针返回值是指针
举例举例

```c
#include<stdio.h>
#include<stdlib.h>

int *chae (int a,char b){
    int *result = malloc(4*sizeof(int));//不想成为野指针那就把该变量放进堆里面!这行的意思就是创建一个4*sizeod(int)=4*4=16字节的堆内存来保存数据
    *result = a;//把 a 的值复制到 result 所指向的内存空间中
    return result;//这是指针变量,所以该返回值为地址,这个地方就是返回result指向的地址值
}

int main(){
    int *(*ptr[5])(int,char);
    ptr[0] = chae;//先和局部函赋上

    int *ans = ptr[0](3,'w');//因为返回值仍然为地址,所以需要用*ans来指向该地址

    printf("%d",*ans);

    free(ans);//再把这堆释放掉，因为又被*ans指向,所以需要释放ans内的地址内存

    return 0;
}
```
这里的指针意思是:ptr是个数组指针,指针内的每个元素都是指针，每个指针数组元素都指向函数(也就是赋值这些函数的地址额)，类型只能为int和char,这些局部函数其返回值是一个指针
然后就把chae放进第一个元素里去,所得到的地址再变成指针,再用解引去把指针地址解出值来就是3
建议还是去看看[这个](https://www.runoob.com/cprogramming/c-fun-pointer-callback.html)所讲的指针函数

<p align ="center">
    <img src ="it's_fine.jpg" alt ="很显然我已经把自己绕进去了,无数个指针以及所指向的地址实在是乱" style ="max-width:100%; height:auto;">
</p>

***
## 螺旋读取指针法

<p align ="center">
    难的讲完了,该讲讲轻松的话题了
    <img src ="readable.png" style ="max-width:90%; height:auto;">
</p>

这个读取法是偶然在探讨指针帖上看到的,[螺旋读取法](https://c-faq.com/decl/spiral.anderson.html)的读法似乎会比先又再左会好理解一点
懒得手打了就直接拿这里面的例子来解释吧
```c
                     +--------------------+
                     | +---+              |
                     | |+-+|              |
                     | |^ ||              |
                char *(*fp)( int, float *);
                 ^   ^ ^  ||              |
                 |   | +--+|              |
                 |   +-----+              |
                 +------------------------+

```
其本质就是从内向外依次读取,这个图就可以很好的展示fp对各种类型的结合顺序

首先fp和括号结合,代表着优先级转换
然后*fp就是代表fp是一个指针
然后再和外面的(int,float*)就是fp的指针指向一个函数,其类型只能为int,float*
再和指针结合代表该指针函数的返回也是一个指针
最后再表示这个指针函数返回的指针所指向的类型为char

怎样?是不是和先又再左的逻辑一样?没有说哪种更好,只是自己更倾向于这样理解:P
## The End?
我必须承认的是我还没有完全理解指针和地址之间的理解,总有一天终我会逐渐理解一切

<b>Learning is a process of realizing how igorant you are</b>

之后肯定还会有更多关于指针方面的讨论
***
参考:
[https://www.reddit.com/r/C_Programming/comments/18ixoxr/best_pointers_explanation/](https://www.reddit.com/r/C_Programming/comments/18ixoxr/best_pointers_explanation/)
[https://www.cnblogs.com/menkeyi/p/18679375](https://www.cnblogs.com/menkeyi/p/18679375)
[【18分钟速通 指针函数指针数组数组☝️🤓】 https://www.bilibili.com/video/BV18gGezoEjV/?share_source=copy_web&vd_source=040ed217ed20932d28aa589416f9c281](https://www.bilibili.com/video/BV18gGezoEjV/?share_source=copy_web&vd_source=040ed217ed20932d28aa589416f9c281)
[https://blog.csdn.net/soonfly/article/details/51131141](https://blog.csdn.net/soonfly/article/details/51131141)

另外就是我在上网查找资料中偶然找到的一个有趣的网站:
[https://pointerpointer.com/](https://pointerpointer.com/)


<center><font color="#185a61"><b>本篇完-have good day~~(*^▽^*)</b></font></center>

